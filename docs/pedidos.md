# Pedidos: criação, status e cancelamento

[Voltar ao README](../README.md)

## Criação de pedido

`POST /api/v1/pedidos` é o começo do fluxo crítico: cria o pedido em `AGUARDANDO_PAGAMENTO`, à espera do [pagamento](pagamento.md).

```json
{
  "unidadeId": 1,
  "canalPedido": "TOTEM",
  "itens": [{ "produtoId": 1, "quantidade": 2 }]
}
```

- **O cliente vem do token.** O corpo não aceita `clienteId`, então ninguém cria pedido em nome de outra pessoa, e a resposta não expõe dado pessoal.
- **O servidor calcula o preço.** Cada item copia o nome e o preço praticado na unidade naquele momento, e o total é somado em centavos inteiros, sem erro de ponto flutuante.
- **O estoque é baixado na criação**, com uma movimentação de `SAIDA` por item, vinculada ao pedido. Baixar só na aprovação do pagamento deixaria a checagem da criação como mera sugestão: dois clientes poderiam pagar pela mesma última unidade, e o conflito apareceria depois do dinheiro, na forma de estorno. Com a baixa na criação, o 409 acontece antes de qualquer cobrança. A recusa do pagamento devolve o saldo com uma movimentação de `ENTRADA`.
- **Pontos podem virar desconto.** Com `pontosResgatados`, o cliente troca pontos de [fidelidade](fidelidade-e-promocoes.md) por desconto em `desconto`, e o `total` já sai abatido.
- **Pedidos simultâneos não vendem a mesma unidade duas vezes.** Tudo roda numa transação, e os saldos dos produtos do pedido são bloqueados com `SELECT ... FOR UPDATE`, sempre na ordem do `produto_id` para evitar deadlock. Um segundo pedido pelo mesmo produto espera o primeiro terminar e enxerga o saldo já baixado. Há um teste que dispara dois pedidos ao mesmo tempo pela última unidade e exige um `201` e um `409`; sem o bloqueio, os dois são aceitos.

As verificações seguem uma ordem fixa, e cada uma aponta em `details` todos os itens com problema, não só o primeiro:

| Situação | Status | `error` |
|---|---|---|
| `canalPedido` ausente ou fora da lista, itens vazios ou repetidos | 422 | `DADOS_INVALIDOS` |
| Unidade inexistente | 404 | `UNIDADE_NAO_ENCONTRADA` |
| Unidade inativa | 409 | `UNIDADE_INATIVA` |
| Produto fora do cardápio da unidade | 404 | `PRODUTO_NAO_ENCONTRADO` |
| Produto marcado indisponível na unidade ou inativo na rede | 409 | `PRODUTO_INDISPONIVEL` |
| Quantidade acima do saldo | 409 | `ESTOQUE_INSUFICIENTE` |
| Resgate de pontos sem adesão ativa à fidelidade | 409 | `FIDELIDADE_INATIVA` |
| Pontos resgatados acima do saldo | 409 | `SALDO_DE_PONTOS_INSUFICIENTE` |
| Desconto acima de 50% do subtotal | 409 | `DESCONTO_ACIMA_DO_LIMITE` |

Limitação conhecida: um pedido que nunca é pago segura o estoque indefinidamente. Liberar a reserva de pedidos abandonados exige expiração por tempo, com uma rotina agendada que cancele o pedido e devolva o saldo, e isso não está implementado.

## Status do pedido

Depois de pago, o pedido avança por `PATCH /api/v1/pedidos/:id/status` com `{ "status": "EM_PREPARO" }`. Cada transição tem os perfis que podem fazê-la, numa tabela ao lado do ciclo de vida no model `Pedido` (`PERFIS_POR_TRANSICAO`), consultada por `pedido.podeSerTransicionadoPor(usuario, destino)`:

| Transição | Perfis |
|---|---|
| `PAGO` → `EM_PREPARO` | COZINHA, GERENTE |
| `EM_PREPARO` → `PRONTO` | COZINHA, GERENTE |
| `PRONTO` → `ENTREGUE` | ATENDENTE, GERENTE |
| `AGUARDANDO_PAGAMENTO` → `CANCELADO` | CLIENTE dono, ATENDENTE, GERENTE, ADMIN |
| `PAGO`, `EM_PREPARO` ou `PRONTO` → `CANCELADO` | GERENTE, ADMIN |

- **Cada um no seu posto.** A cozinha começa e termina o preparo, o balcão entrega, e o gerente cobre os dois. ADMIN enxerga todos os pedidos e pode cancelá-los, mas não avança nenhum: a matriz não está na cozinha nem no balcão.
- **`PAGO` não é aceito no corpo** (`422`). Só o webhook do provedor marca o pedido como pago.
- **A ordem das checagens** é existência (`404`), escopo (`403`), transição prevista no ciclo de vida (`409 TRANSICAO_DE_STATUS_INVALIDA`, com os destinos possíveis em `details`) e perfil (`403 SEM_PERMISSAO`). A transição vem antes do perfil para que um pedido `ENTREGUE` responda `409` a qualquer um, o que descreve melhor o problema.
- **Transições simultâneas não se somam.** O pedido é travado com `SELECT ... FOR UPDATE` durante as checagens e a gravação. Se a cozinha toca duas vezes em "iniciar preparo", o segundo toque espera o primeiro, encontra o pedido já `EM_PREPARO` e recebe `409`. Há um teste para isso, e sem a trava os dois são aceitos.

### Cancelamento

O cancelamento usa a mesma rota, com motivo obrigatório: `{ "status": "CANCELADO", "motivo": "Cliente desistiu no balcão" }`. Antes de pago, o próprio cliente ou o balcão podem cancelar; depois de pago, há dinheiro a devolver, e só o gerente ou a matriz decidem. As regras, na ordem:

1. **Pagamento `PENDENTE` bloqueia** (`409 PAGAMENTO_EM_ANDAMENTO`). Se o cancelamento passasse, uma aprovação chegando depois deixaria o cliente cobrado por um pedido cancelado.
2. **Pagamento `APROVADO` é estornado no provedor** (`POST /pagamentos/:id/estorno` no mock) antes de o pedido mudar. Se o provedor falhar, a resposta é `503` ou `502` e nada muda.
3. **O estoque volta só se os insumos não foram usados**: cancelado de `AGUARDANDO_PAGAMENTO` ou `PAGO`, cada item gera uma `ENTRADA` com o usuário que cancelou e o motivo `Cancelamento do pedido <codigo>`. De `EM_PREPARO` ou `PRONTO` a comida já foi feita: há estorno, mas o saldo não volta.
4. O pedido grava `CANCELADO`, `canceladoEm` e `motivoCancelamento`; o pagamento grava `ESTORNADO`, `estornadoEm` e a resposta do provedor.

A devolução de estoque é a mesma da recusa do pagamento pelo webhook (`Estoque.devolverItensDe`). Os dois caminhos também devolvem os pontos de fidelidade resgatados no pedido.

Ao contrário da solicitação de pagamento, o estorno é pedido ao provedor com o pedido já travado (`SELECT ... FOR UPDATE`). Se o estorno saísse antes da trava, uma entrega concluída no meio do caminho deixaria o dinheiro devolvido no provedor e o pedido `ENTREGUE` e pago na API. O custo é segurar uma conexão do banco durante a chamada, limitada pelo timeout e pelo número de tentativas do cliente HTTP. A chave é `estorno-<pedidoId>`: se a gravação falhar depois do estorno, a nova tentativa reenvia a mesma chave e o provedor devolve o mesmo estorno, sem estornar em dobro. Dois cancelamentos simultâneos esperam a trava, e o segundo recebe `409`.

### Limitações conhecidas do status

- Não há volta de status. Um toque errado (marcar como pronto antes da hora) não se desfaz, o que preserva o histórico do pedido mas exige cuidado na operação.
- Um pagamento que fica `PENDENTE` para sempre (webhook perdido) impede o cancelamento do pedido. Resolver isso depende da conciliação de pagamentos, ainda não implementada.
- O mock guarda os pagamentos em memória: depois de reiniciado, o estorno de um pagamento antigo responde `404` no mock e `502` na API.
