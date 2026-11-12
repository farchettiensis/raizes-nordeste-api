# Autorização e estoque

[Voltar ao README](../README.md)

## Autorização por perfil

Cada usuário tem um perfil (`CLIENTE`, `ATENDENTE`, `COZINHA`, `GERENTE`, `ADMIN`), e o middleware nomeado `perfil` restringe a rota aos perfis que ela aceita:

```ts
router
  .get(':id/estoque', [controllers.Estoques, 'index'])
  .use(middleware.perfil({ perfis: PERFIS_DA_OPERACAO }))
```

Sem token, a resposta é `401 NAO_AUTENTICADO`. Com token de um perfil que a rota não aceita, é `403 SEM_PERMISSAO`, no mesmo corpo padronizado de qualquer outra falha. O perfil é conferido antes de o controller rodar, então um perfil sem permissão não descobre nem se o recurso existe.

O saldo de estoque fica restrito a quem opera a unidade porque o que interessa ao cliente, se o produto está disponível, ele já vê no cardápio público, sem saber quantas unidades restam.

Nas rotas de um pedido existente, além do perfil, a API confere o escopo do usuário com uma regra única, que mora no model `Pedido` (`visivelPara` para um pedido, escopo de query `visiveisPara` para listagens):

| Perfil | Enxerga |
|---|---|
| CLIENTE | os próprios pedidos |
| ATENDENTE, COZINHA, GERENTE | os pedidos da unidade a que está vinculado (`users.unidade_id`) |
| ADMIN | todos |

Fora do escopo, a resposta é `403 SEM_PERMISSAO`. Um perfil de unidade sem unidade vinculada recebe `403 SEM_UNIDADE_VINCULADA`: é um erro de cadastro, não uma lista vazia. A ordem é perfil, existência (`404`) e escopo (`403`). `GET /pedidos/:id` aceita qualquer perfil autenticado; `POST /pedidos/:id/pagamento` continua exclusivo do CLIENTE, então ali o escopo se reduz ao dono do pedido.

No estoque vale o mesmo vínculo: ATENDENTE, COZINHA e GERENTE consultam só a unidade em `users.unidade_id` (outra unidade é `403 SEM_PERMISSAO`, sem vínculo é `403 SEM_UNIDADE_VINCULADA`), e ADMIN consulta qualquer uma. A existência da unidade é conferida antes (`404`).

### Entradas e ajustes de estoque

`POST /api/v1/unidades/:id/estoque/movimentacoes` exige GERENTE da própria unidade ou ADMIN. ATENDENTE, COZINHA e CLIENTE recebem `403`. O produto precisa ter saldo cadastrado naquela unidade, inclusive se estiver zerado; unidade ou registro de estoque inexistente responde `404`. O endpoint não cadastra produtos, cardápios nem novos registros de estoque. Tanto a consulta quanto a movimentação de estoque validam o id da unidade: deve ser inteiro entre 1 e 2147483647; fora disso, respondem `422 DADOS_INVALIDOS` antes da consulta ao banco.

```json
{
  "produtoId": 1,
  "tipo": "ENTRADA",
  "quantidade": 20,
  "motivo": "Reposição semanal"
}
```

`ENTRADA` soma uma quantidade inteira positiva. `AJUSTE` aplica uma diferença inteira com sinal: saldo 10 e quantidade -3 resultam em saldo 7; quantidade 3 resulta em 13. Serve para perdas e correções de inventário. Zero não gera movimento e responde `422`, assim como motivo ausente ou fora de 3 a 255 caracteres após remover espaços nas extremidades. `SAIDA` permanece vinculada ao fluxo de pedidos.

A resposta `201` devolve o movimento em `data`, com `movimentoId`, `estoqueId`, `usuarioId`, `tipo`, `quantidade`, `saldoResultante`, `motivo` e `createdAt`. Saldo negativo responde `409 ESTOQUE_INSUFICIENTE`; saldo resultante somado às unidades reservadas em pedidos `AGUARDANDO_PAGAMENTO` ou `PAGO` acima do limite inteiro do banco (2147483647), `409 SALDO_ESTOQUE_ACIMA_DO_LIMITE`. A soma das reservas ocorre depois de obter a trava do estoque, preservando espaço para devoluções por cancelamento ou recusa de pagamento. Pedidos em preparo, prontos, entregues ou cancelados não compõem essa reserva.

Saldo, movimento e auditoria `estoque.movimentado` são persistidos na mesma transação. A trava `SELECT ... FOR UPDATE` no estoque é a mesma usada pelos pedidos e devoluções, evitando perda de atualização entre operações concorrentes. Uma falha reverte tudo. O movimento manual registra o responsável e fica sem pedido vinculado. Cada chamada válida é um novo lançamento, sem chave de idempotência: após timeout, confira o saldo e a auditoria antes de repetir.
