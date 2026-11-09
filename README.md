# API Raízes do Nordeste

API REST da rede de lanchonetes Raízes do Nordeste, construída com AdonisJS 7, PostgreSQL e Lucid ORM.

Projeto Multidisciplinar 2026, trilha Back-End (UNINTER).

## Estrutura do repositório

| Pasta | O que é |
|---|---|
| `api/` | A API REST, em AdonisJS |
| `pagamento-mock/` | Provedor de pagamento simulado, serviço separado em Fastify (veja o [README dele](pagamento-mock/README.md), que explica a escolha) |
| `postman/` | Coleção Postman com o [plano de testes](#plano-de-testes) executável |

## Execução com Docker

Com Docker e Docker Compose instalados, um comando sobe o PostgreSQL, o pagamento mock e a API, já com as migrations aplicadas e os dados de demonstração:

```bash
docker compose up --build
```

| Serviço | URL |
|---|---|
| API e Swagger | http://localhost:3333/docs |
| Pagamento mock | http://localhost:4000/openapi.yaml |
| PostgreSQL | `127.0.0.1:5433`, usuário e senha `postgres` |

As variáveis do `docker-compose.yml` são de demonstração local, inclusive o `APP_KEY` e o segredo do webhook. Para desenvolver com recarga automática, rode as aplicações direto no host, como descrito abaixo.

A API e o pagamento mock são processos separados, cada um no seu container, e só conversam por HTTP: a API chama `http://pagamento-mock:4000` e o mock devolve o resultado em `http://api:3333/api/v1/pagamentos/webhook`. O código entra na imagem no build, então depois de mudar o código é preciso o `--build`; sem ele, o `docker compose up` reaproveita as imagens já construídas.

## Requisitos para rodar no host

- Node.js 24 ou superior
- npm 11 ou superior
- PostgreSQL 14 ou superior, acessível localmente

## Como executar

A API vive em `api/`, e os comandos a seguir rodam a partir dessa pasta, exceto onde indicado.

```bash
cd api
npm install
cp .env.example .env
```

Abra o `.env` e ajuste as variáveis de banco para o seu PostgreSQL. Os valores padrão assumem um servidor local em `127.0.0.1:5432` com o usuário `postgres`.

| Variável | Para que serve | Padrão |
|---|---|---|
| `PORT` | Porta em que a API escuta | `3333` |
| `APP_KEY` | Chave de criptografia da aplicação | gerada na instalação |
| `DB_HOST` | Host do PostgreSQL | `127.0.0.1` |
| `DB_PORT` | Porta do PostgreSQL | `5432` |
| `DB_USER` | Usuário do banco | `postgres` |
| `DB_PASSWORD` | Senha do banco | vazio |
| `DB_DATABASE` | Nome do banco | `raizes_nordeste` |
| `PAGAMENTO_GATEWAY_URL` | Endereço do pagamento mock | `http://localhost:4000` |
| `PAGAMENTO_WEBHOOK_SECRET` | Segredo da assinatura do webhook, o mesmo do mock | `troque-este-segredo` |

Crie os bancos de desenvolvimento e de testes:

```bash
createdb -h 127.0.0.1 -U postgres raizes_nordeste
createdb -h 127.0.0.1 -U postgres raizes_nordeste_test
```

Rode as migrations, popule os dados de demonstração e suba a API:

```bash
node ace migration:run
node ace db:seed
npm run dev
```

A API sobe na URL impressa na inicialização, em geral `http://localhost:3333`. Se a porta do `.env` estiver ocupada, o Adonis escolhe outra, então use sempre a URL do console. Nesse caso, ajuste também o `WEBHOOK_URL` do mock, ou o resultado do pagamento não chega.

### Pagamento mock no host

O pagamento só se completa com o mock no ar. Em outro terminal, a partir da raiz do repositório:

```bash
cd pagamento-mock
npm install
cp .env.example .env
npm run dev
```

Os padrões dos dois `.env.example` já combinam: a API chama o mock em `localhost:4000`, o mock entrega o webhook em `localhost:3333` e os dois usam o mesmo segredo. Se mudar o segredo de um lado, mude do outro, ou o webhook responde `401 ASSINATURA_INVALIDA`.

### Mock no Docker, API no host

Também dá para subir só o mock em container e manter a API no host. Duas coisas mudam em relação ao Compose completo:

- dentro do container, `api:3333` não existe e `localhost` é o próprio container, então o webhook precisa apontar para `host.docker.internal`, e o segredo precisa ser o mesmo do `api/.env`;
- a API precisa escutar em todas as interfaces (`HOST=0.0.0.0`), porque o `HOST=localhost` do `.env` só aceita conexões do próprio host, e o container chega por outra interface.

```bash
PAGAMENTO_WEBHOOK_URL=http://host.docker.internal:3333/api/v1/pagamentos/webhook \
PAGAMENTO_WEBHOOK_SECRET=troque-este-segredo \
docker compose up pagamento-mock

cd api && HOST=0.0.0.0 npm run dev
```

### Dados de demonstração

O seeder cria quatro unidades (uma delas inativa, de propósito), oito produtos, o cardápio e o estoque de cada unidade, e um usuário para cada perfil. Rodá-lo mais de uma vez não duplica nada. Todas as contas usam a senha `Senha@123`:

| E-mail | Perfil |
|---|---|
| `admin@raizes.test` | ADMIN |
| `gerente@raizes.test` | GERENTE |
| `atendente@raizes.test` | ATENDENTE |
| `cozinha@raizes.test` | COZINHA |
| `cliente@raizes.test` | CLIENTE |

O cliente já vem inscrito na [fidelidade](#fidelidade), com 200 pontos de saldo inicial, para o resgate poder ser demonstrado de imediato.

## Documentação da API

Com o servidor rodando, abra `/docs` na URL impressa na inicialização. A raiz `/` redireciona para lá.

O contrato fica em [`api/openapi.yaml`](api/openapi.yaml) e é servido em `/docs/openapi.yaml`. O Swagger UI é servido a partir do pacote instalado localmente, sem depender de CDN, então a documentação funciona offline.

O documento é escrito à mão, e não gerado por biblioteca. Em troca disso, um teste automatizado compara os caminhos declarados no `openapi.yaml` com as rotas realmente registradas no router e falha se as duas listas divergirem, de modo que o contrato não envelhece em silêncio.

## Endpoints

O Swagger em `/docs` traz os exemplos de request e response de cada um. Esta tabela é só um mapa rápido.

| Método | Rota | Auth | O que faz |
|---:|:---|:---|:---|
| GET | `/` | pública | Redireciona para a documentação |
| GET | `/docs` | pública | Swagger UI |
| POST | `/api/v1/auth/signup` | pública | Cria conta e devolve token |
| POST | `/api/v1/auth/login` | pública | Autentica e devolve token |
| GET | `/api/v1/account/profile` | token | Dados da conta autenticada |
| POST | `/api/v1/account/logout` | token | Revoga o token em uso |
| GET | `/api/v1/unidades` | pública | Lista unidades, com filtros e paginação |
| GET | `/api/v1/unidades/:id` | pública | Detalhe de uma unidade |
| GET | `/api/v1/unidades/:id/cardapio` | pública | Cardápio da unidade, com preço e disponibilidade |
| GET | `/api/v1/unidades/:id/estoque` | token, perfis da operação, própria unidade | Saldo de estoque da unidade, produto a produto |
| GET | `/api/v1/pedidos` | token, pedidos no escopo do usuário | Lista pedidos, filtrando por `canalPedido`, `status` e `unidadeId` |
| POST | `/api/v1/pedidos` | token, perfil CLIENTE | Cria o pedido validando cardápio e estoque da unidade |
| GET | `/api/v1/pedidos/:id` | token, pedido no escopo do usuário | Pedido com itens e pagamento |
| PATCH | `/api/v1/pedidos/:id/status` | token, perfil da transição, pedido no escopo | Avança o pedido da cozinha ao balcão ou o cancela |
| POST | `/api/v1/pedidos/:id/pagamento` | token, perfil CLIENTE, dono do pedido | Solicita o pagamento ao provedor externo |
| POST | `/api/v1/pagamentos/webhook` | assinatura HMAC do provedor | Recebe o resultado do pagamento |
| GET | `/api/v1/fidelidade` | token, perfil CLIENTE | Situação no programa de pontos: adesão, saldo e regras |
| GET | `/api/v1/fidelidade/movimentos` | token, perfil CLIENTE | Extrato de pontos, paginado |
| POST | `/api/v1/fidelidade/adesao` | token, perfil CLIENTE | Adere ao programa com consentimento explícito |
| DELETE | `/api/v1/fidelidade/adesao` | token, perfil CLIENTE | Revoga o consentimento e sai do programa |
| GET | `/api/v1/auditoria` | token, perfil ADMIN | Trilha de auditoria das ações sensíveis, com filtros |

Listagens aceitam `?page=1&limit=10` e respondem `{ "data": [...], "metadata": { ... } }`.

Consultar unidades e cardápio é público de propósito: na jornada do caso, o cliente vê o cardápio da unidade antes de se identificar.

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

## Criação de pedido

`POST /api/v1/pedidos` é o começo do fluxo crítico: cria o pedido em `AGUARDANDO_PAGAMENTO`, à espera do [pagamento](#pagamento).

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
- **Pontos podem virar desconto.** Com `pontosResgatados`, o cliente troca pontos de [fidelidade](#fidelidade) por desconto em `desconto`, e o `total` já sai abatido.
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

## Pagamento

O pagamento fecha o fluxo crítico (pedido, pagamento externo, atualização de status). A rede não processa pagamento: como pede o caso, a API **solicita** o pagamento a um provedor externo, **recebe** a confirmação ou a negativa, **registra** o resultado e **atualiza** o status do pedido. O provedor é simulado pelo serviço [`pagamento-mock/`](pagamento-mock/README.md), que roda em processo separado, como rodaria um gateway de verdade.

```mermaid
sequenceDiagram
    participant C as Cliente (App/Totem/Web)
    participant A as API
    participant P as Pagamento mock
    C->>A: POST /pedidos/:id/pagamento { metodo }
    A->>P: POST /pagamentos (Idempotency-Key)
    P-->>A: 201 PENDENTE (+ copia e cola, se PIX)
    A-->>C: 202 PENDENTE
    Note over P: POST /simulacoes decide APROVADO ou RECUSADO
    P->>A: POST /pagamentos/webhook (X-Assinatura)
    A->>A: PAGO, ou CANCELADO com estoque devolvido
    A-->>P: 204
    C->>A: GET /pedidos/:id
    A-->>C: status atualizado e pagamento
```

### Como demonstrar

Com a pilha no ar (`docker compose up --build`):

1. Faça login com `cliente@raizes.test` e crie um pedido em `POST /api/v1/pedidos`.
2. Peça o pagamento em `POST /api/v1/pedidos/{id}/pagamento` com `{ "metodo": "PIX" }`. A resposta é `202` com o pagamento `PENDENTE` e a `referenciaExterna`, o identificador no provedor.
3. Decida o resultado no mock: `POST http://localhost:4000/simulacoes` com `{ "pagamentoId": "<referenciaExterna>", "resultado": "APROVADO" }` (ou `"RECUSADO"`, com `motivo` opcional). É o papel do cliente pagando no app do banco, ou do emissor recusando.
4. Consulte `GET /api/v1/pedidos/{id}`: aprovado deixa o pedido `PAGO`; recusado deixa o pedido `CANCELADO`, o pagamento `RECUSADO` com o motivo, e o estoque de volta ao saldo anterior.

### Decisões

- **Assíncrono, como num provedor real.** A solicitação responde `202` e o resultado chega depois, por webhook. PIX, um dos métodos aceitos, é assíncrono por natureza: o cliente paga no app do banco e o provedor avisa. O `202` informa o que se sabe naquele momento, e o cliente acompanha o desfecho pelo `GET /pedidos/:id`.
- **Recusa cancela o pedido e devolve o estoque.** O pedido vai para `CANCELADO`, o pagamento para `RECUSADO` com o motivo, e cada item volta ao saldo com uma movimentação de `ENTRADA` vinculada ao pedido, tudo numa transação. Manter o pedido aberto para nova tentativa obrigaria a reservar o estoque de novo no meio do pagamento, ou a segurá-lo indefinidamente; para tentar outra vez, o cliente cria um novo pedido.
- **O registro guarda o envio e o retorno.** `pagamentos.payload_requisicao` tem o que foi enviado ao provedor, `payload_resposta` a resposta da solicitação e `payload_webhook` o evento com o resultado, além de `referencia_externa` e `processado_em`. O envio não leva dado pessoal do cliente, só a referência, o valor em centavos, o método e o código do pedido.
- **Sem dados de cartão.** A captura do cartão é responsabilidade do app cliente junto ao provedor, como fazem os gateways reais. A API recebe só o método, e nem ela nem o mock veem número de cartão, o que tira a API do escopo mais pesado de conformidade de cartões e reduz o que há a proteger sob a LGPD.
- **`DINHEIRO` fica fora desta rota.** Dinheiro não passa por provedor externo; é confirmado no balcão pelo atendente, fluxo que ainda não está implementado. A rota aceita `PIX`, `CARTAO_CREDITO` e `CARTAO_DEBITO`.
- **Rota aninhada no pedido.** O §6.1 do roteiro organiza `/pagamentos` como recurso de simulação e confirmação. Aqui a solicitação fica em `/pedidos/:id/pagamento`, porque o pagamento pertence ao pedido e a existência, a posse e o status são todos checados nele; a confirmação é `/pagamentos/webhook`.

### Idempotência

O provedor entrega cada evento ao menos uma vez, e o cliente pode repetir a solicitação depois de um timeout. Nenhum dos dois casos cobra ou devolve estoque duas vezes:

- **Solicitação idempotente por pedido.** O pedido fica bloqueado (`SELECT ... FOR UPDATE`) durante a checagem, e um pedido tem no máximo um pagamento (`pagamentos.pedido_id` é único). Repetir a chamada com o mesmo método devolve o mesmo pagamento; com outro método, é `409 PAGAMENTO_EM_ANDAMENTO`.
- **Chave de idempotência no provedor.** A API envia `Idempotency-Key: pagamento-<id>`. Se o provedor não respondeu, a nova tentativa reusa a mesma chave, e o provedor devolve o pagamento original em vez de criar outro.
- **Webhook idempotente.** O pedido e o pagamento ficam bloqueados durante o processamento, e um resultado para um pagamento que já não está `PENDENTE` é ignorado com `204`. O mock entrega cada evento duas vezes de propósito (`WEBHOOK_DELIVERIES=2`), para exercitar isso.

Há testes que disparam solicitações e entregas simultâneas enquanto o pedido está bloqueado e exigem um único pagamento e uma única devolução de estoque; sem os bloqueios, eles falham.

### Falhas do provedor

A chamada ao provedor fica fora de qualquer transação, para não segurar bloqueios do banco enquanto espera a rede. Falhas transitórias (rede, timeout, status 5xx) são retentadas com espera exponencial e a mesma chave. Esgotadas as tentativas, a resposta é `503 GATEWAY_PAGAMENTO_INDISPONIVEL`, o pagamento fica `PENDENTE` sem referência externa, e repetir a chamada retoma de onde parou. Uma resposta fora do contrato, validada com VineJS, vira `502 GATEWAY_PAGAMENTO_ERRO`. O mock simula indisponibilidade com `FAILURE_RATE`.

### Segurança do webhook

O webhook não usa token: quem chama é o provedor. A autenticidade vem do cabeçalho `X-Assinatura: t=<unix>,v1=<hmac>`, um HMAC-SHA256 de `<t>.<corpo bruto>` com o segredo compartilhado `PAGAMENTO_WEBHOOK_SECRET`, comparado em tempo constante. Assinatura ausente, inválida ou com mais de 5 minutos responde `401 ASSINATURA_INVALIDA`, o que barra tanto um corpo adulterado quanto a repetição de uma entrega capturada. Além disso, o valor e o identificador do provedor são conferidos com o pagamento registrado (`409 PAGAMENTO_DIVERGENTE`).

### Limitações conhecidas

- O mock guarda o estado em memória. Se ele reiniciar com pagamentos pendentes, esses pagamentos não recebem mais resultado.
- Se o provedor esgotar as tentativas de entrega do webhook, o pagamento fica `PENDENTE`. O mock já expõe `GET /pagamentos/:id`, e uma rotina de conciliação que consulte os pendentes antigos é o passo seguinte, ainda não implementado.
- Um pagamento pendente segura o estoque do pedido pelo tempo que durar, pela mesma razão descrita na criação de pedido.

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

## Fidelidade

O programa de pontos é opcional e depende de consentimento explícito, como pede o caso: *"conhecer o cliente é importante, mas respeitar sua privacidade é obrigatório"*.

| Regra | Valor |
|---|---|
| Acúmulo | 1 ponto por real do total pago, creditado quando o pedido é `ENTREGUE` |
| Resgate | R$ 0,05 por ponto, como desconto na criação do pedido (`pontosResgatados`) |
| Limite do desconto | 50% do subtotal |

As regras são constantes no model `FidelidadeConta` e voltam em `GET /api/v1/fidelidade`, para o app mostrá-las sem duplicar valores.

```mermaid
stateDiagram-v2
    [*] --> SemAdesao
    SemAdesao --> Ativa: POST /fidelidade/adesao { consentimento: true }
    Ativa --> Ativa: entrega (ACUMULO), resgate (RESGATE), cancelamento (ESTORNO)
    Ativa --> Revogada: DELETE /fidelidade/adesao (EXPIRACAO do saldo)
    Revogada --> Ativa: nova adesão, saldo zero
```

- **Adesão é consentimento.** `POST /fidelidade/adesao` só aceita `{ "consentimento": true }`; qualquer outro corpo é `422`. A data fica em `users.consentimento_fidelidade_em`, a conta é aberta e a auditoria registra `fidelidade.aderida`. A base legal é o consentimento (LGPD, art. 7º, I), porque cruzar o histórico de consumo para dar benefícios não é necessário para vender um lanche.
- **Pontos só na entrega.** Um pedido entregue não pode mais ser cancelado, então ponto ganho nunca precisa ser estornado. Creditar na aprovação do pagamento obrigaria a retirar os pontos num cancelamento posterior, e eles já poderiam ter sido gastos.
- **O resgate sai na criação e volta no cancelamento.** Os pontos são debitados na mesma transação do pedido, com a conta travada (`SELECT ... FOR UPDATE`), e todo cancelamento (pelo cliente, pela operação ou pela recusa do pagamento) devolve o que foi resgatado com um movimento de `ESTORNO`. Há um teste que dispara dois pedidos simultâneos gastando o mesmo saldo e exige um `201` e um `409`; sem a trava, os dois passam.
- **Revogar vale a qualquer momento** (art. 8º, § 5º). `DELETE /fidelidade/adesao` limpa a data do consentimento, zera o saldo com um movimento de `EXPIRACAO` e registra `fidelidade.revogada`. A conta e o extrato ficam, porque sustentam os descontos já concedidos em pedidos; a partir dali nada mais é acumulado nem resgatado, nem devolvido por cancelamento. Uma nova adesão reabre a mesma conta, com saldo zero.
- **Extrato completo.** Todo lançamento é um movimento em `fidelidade_movimentos`, com o saldo resultante e o pedido de origem, consultado em `GET /fidelidade/movimentos`.

Limitações conhecidas: os pontos não expiram por tempo (o tipo `EXPIRACAO` existe, mas só a revogação o usa), e as campanhas segmentadas por frequência, idade e perfil, citadas no caso, ficam para as promoções, que hoje só existem como tabela (`promocoes`).

## Auditoria

Toda ação sensível deixa um registro em `logs_auditoria`, que a matriz consulta por `GET /api/v1/auditoria` (só ADMIN), filtrando por `acao`, `entidade`, `entidadeId` e `usuarioId`. O histórico completo de um pedido sai de `?entidade=pedido&entidadeId=<id>`.

| Ação | Quando |
|---|---|
| `usuario.cadastrado` | cadastro de conta (guarda só o perfil) |
| `auth.login`, `auth.logout` | entrada e saída |
| `auth.login_negado` | senha errada ou e-mail desconhecido; aponta a conta alvo quando ela existe |
| `pedido.criado` | criação do pedido, com unidade, canal e total |
| `pedido.status_alterado` | todo avanço de status, inclusive a aprovação pelo webhook (com `usuarioId` nulo) |
| `pedido.cancelado` | todo cancelamento, inclusive pela recusa do pagamento (com `usuarioId` nulo e o motivo da recusa), com o status de origem, o motivo, se houve estorno e se o estoque voltou |
| `pagamento.solicitado`, `pagamento.aprovado`, `pagamento.recusado`, `pagamento.estornado` | ciclo do pagamento |
| `fidelidade.aderida`, `fidelidade.revogada` | consentimento da fidelidade dado ou revogado; a revogação guarda os pontos perdidos |
| `acesso.negado` | qualquer `403` da API, com método, rota, parâmetros e código do erro |

- **Na mesma transação da ação.** O registro é gravado dentro da transação que muda o pedido ou o pagamento: ou os dois entram, ou nenhum. Uma ação que falha (estoque insuficiente, provedor fora do ar no estorno) não deixa registro de sucesso, e uma ação gravada nunca fica sem registro.
- **Negações fora da transação.** O `403` já desfez a ação, então o registro de `acesso.negado` é gravado pelo tratador de erros, para qualquer rota. Se a gravação falhar, o erro vai para o log da aplicação e a resposta continua sendo o `403` original. O `401` por falta de token não é registrado, porque não identifica ninguém e só faria ruído; a tentativa de login com senha errada é.
- **Rastreável até a requisição.** Cada registro guarda o `ip` e o `requestId`, o mesmo do cabeçalho `X-Request-Id` e do corpo de erro. Os dois vêm do contexto HTTP pelo `AsyncLocalStorage` do AdonisJS (`useAsyncLocalStorage: true`), sem precisar passar o contexto por cada serviço.
- **Minimização (LGPD).** Os registros não guardam nome, e-mail, senha, token nem o payload do provedor: só identificadores, status, valores e motivos. O IP é dado pessoal e por isso a consulta é restrita ao ADMIN.
- **Retenção.** Os registros devem ser mantidos por pelo menos 6 meses, o prazo de guarda de registros de acesso a aplicações do Marco Civil da Internet (Lei 12.965/2014, art. 15).

Limitações conhecidas: não há expurgo automático depois do prazo de retenção, e leituras de dados pessoais (como `GET /account/profile`) não são registradas, para não encher a trilha com consultas rotineiras.

## Padrão de erro

Toda falha, em qualquer endpoint, responde com o mesmo corpo:

```json
{
  "error": "ESTOQUE_INSUFICIENTE",
  "message": "Nao ha quantidade suficiente para um ou mais itens.",
  "details": [{ "field": "itens.0.quantidade", "issue": "Disponivel: 1" }],
  "timestamp": "2026-02-05T12:00:00.000Z",
  "path": "/api/v1/pedidos",
  "requestId": "33be9a44-6849-439c-960c-cb2d995aa732"
}
```

O campo `error` é um identificador estável, pensado para o cliente tratar programaticamente; `message` é a mensagem legível; `details` traz um item por campo reprovado e vem vazio quando o erro não é de validação.

## Plano de testes

O plano de testes é a coleção [`postman/raizes-nordeste.postman_collection.json`](postman/raizes-nordeste.postman_collection.json). Cada requisição traz asserções (`pm.test`) sobre o status e o corpo, e um script da coleção confere o [padrão de erro](#padrão-de-erro) em toda falha da API.

### Como executar

1. Suba a pilha com os dados de demonstração: `docker compose up --build` na raiz (ou API e mock no host, como em [Como executar](#como-executar)).
2. No Postman, importe o arquivo da coleção. As variáveis `baseUrl` (`http://localhost:3333`) e `mockUrl` (`http://localhost:4000`) já vêm preenchidas; ajuste-as se a API ou o mock estiverem em outro endereço.
3. Rode a coleção inteira pelo Runner, na ordem. Pela linha de comando, o mesmo resultado sai do Newman:

```bash
npx newman run postman/raizes-nordeste.postman_collection.json
```

Não é preciso copiar token nem id à mão: os logins guardam o token de cada perfil, e os scripts guardam os ids de unidade, produto e pedido em variáveis da coleção, descobrindo a unidade e os produtos pelo código do seed. Por isso a ordem importa, e uma requisição avulsa só funciona depois das que a preparam. A coleção pode ser rodada várias vezes sem refazer o seed: o cadastro usa um e-mail aleatório, e cada execução consome pouco estoque.

O pagamento é assíncrono, então as requisições `Mock:` chamam o provedor simulado direto em `/simulacoes`, no papel do cliente pagando no app do banco, e o script espera o webhook atualizar o pedido antes de seguir.

### Cenários

Os cenários numerados são as requisições de mesmo nome na coleção (pasta/nome). As demais (logins de outros perfis, pedidos e pagamentos de apoio, chamadas ao mock) só preparam o cenário seguinte. São 25 positivos e 17 negativos.

| ID | Cenário | Endpoint | Entrada | Esperado | Pasta |
|---|---|---|---|---|---|
| T01 | Cadastro de cliente | `POST /auth/signup` | nome, e-mail novo, senha | 201, token, sem senha na resposta | Auth |
| T02 | Login válido do cliente | `POST /auth/login` | `cliente@raizes.test` | 200 e token | Auth |
| T03 | Perfil da conta autenticada | `GET /account/profile` | token do cliente | 200, dados da conta, sem senha | Auth |
| T04 | Listar unidades com paginação | `GET /unidades` | `?page=1&limit=10` | 200, `data` e `metadata` | Unidades |
| T05 | Cardápio da unidade | `GET /unidades/:id/cardapio` | unidade REC001 | 200, preço local e disponibilidade | Unidades |
| T06 | Estoque da unidade pelo gerente | `GET /unidades/:id/estoque` | token do gerente da unidade | 200, saldo por produto | Unidades |
| T07 | Criar pedido com itens válidos | `POST /pedidos` | canal `APP`, 2 cafés | 201, `AGUARDANDO_PAGAMENTO`, total `12.00` | Pedidos |
| T08 | Consultar pedido | `GET /pedidos/:id` | pedido de T07 | 200, itens | Pedidos |
| T09 | Listar pedidos filtrando por canal | `GET /pedidos` | `?canalPedido=APP` | 200, só pedidos `APP` | Pedidos |
| T10 | Solicitar pagamento PIX | `POST /pedidos/:id/pagamento` | `{ "metodo": "PIX" }` | 202, pagamento `PENDENTE` com referência | Pagamento |
| T11 | Pedido pago após aprovação | `GET /pedidos/:id` | mock `APROVADO` | 200, pedido `PAGO`, pagamento `APROVADO` | Pagamento |
| T12 | Pedido cancelado após recusa | `GET /pedidos/:id` | mock `RECUSADO` com motivo | 200, pedido `CANCELADO`, pagamento `RECUSADO` com o motivo | Pagamento |
| T13 | Cozinha inicia o preparo | `PATCH /pedidos/:id/status` | `EM_PREPARO`, token da cozinha | 200, `EM_PREPARO` | Status |
| T14 | Cozinha marca como pronto | `PATCH /pedidos/:id/status` | `PRONTO`, token da cozinha | 200, `PRONTO` | Status |
| T15 | Atendente entrega o pedido | `PATCH /pedidos/:id/status` | `ENTREGUE`, token da atendente | 200, `ENTREGUE` | Status |
| T16 | Cliente cancela pedido não pago | `PATCH /pedidos/:id/status` | `CANCELADO` e motivo | 200, `CANCELADO` com o motivo | Status |
| T17 | Gerente cancela pedido pago com estorno | `PATCH /pedidos/:id/status` | `CANCELADO` e motivo, pedido pago | 200, `CANCELADO`, pagamento `ESTORNADO` | Status |
| T18 | Histórico do pedido na auditoria | `GET /auditoria` | `?entidade=pedido&entidadeId=<T07>`, token do admin | 200, `pedido.criado` e 4 `pedido.status_alterado`, com `requestId` | Auditoria |
| T19 | Listar pedidos sem token | `GET /pedidos` | sem `Authorization` | 401 `NAO_AUTENTICADO` | Erros |
| T20 | Login com senha errada | `POST /auth/login` | senha errada | 401 `CREDENCIAIS_INVALIDAS` | Erros |
| T21 | Atendente tenta criar pedido | `POST /pedidos` | token da atendente | 403 `SEM_PERMISSAO` | Erros |
| T22 | Cliente consulta pedido de outro cliente | `GET /pedidos/:id` | token de T01, pedido de T07 | 403 `SEM_PERMISSAO` | Erros |
| T23 | Pedido sem canalPedido | `POST /pedidos` | corpo sem `canalPedido` | 422 `DADOS_INVALIDOS`, campo `canalPedido` | Erros |
| T24 | Pedido com canal fora da lista | `POST /pedidos` | `canalPedido: "TELEFONE"` | 422 `DADOS_INVALIDOS`, campo `canalPedido` | Erros |
| T25 | Pedido com quantidade negativa | `POST /pedidos` | `quantidade: -1` | 422 `DADOS_INVALIDOS`, campo `itens.0.quantidade` | Erros |
| T26 | Cadastro com e-mail inválido | `POST /auth/signup` | `email: "nao-e-email"` | 422 `DADOS_INVALIDOS`, campo `email` | Erros |
| T27 | Pedido em unidade inexistente | `POST /pedidos` | `unidadeId: 999999` | 404 `UNIDADE_NAO_ENCONTRADA` | Erros |
| T28 | Consultar pedido inexistente | `GET /pedidos/:id` | id `999999` | 404 `PEDIDO_NAO_ENCONTRADO` | Erros |
| T29 | Pedido em unidade inativa | `POST /pedidos` | unidade FOR001 | 409 `UNIDADE_INATIVA` | Erros |
| T30 | Pedido com estoque insuficiente | `POST /pedidos` | canjica (BOL002), saldo 0 | 409 `ESTOQUE_INSUFICIENTE`, saldo em `details` | Erros |
| T31 | Transição de status inválida | `PATCH /pedidos/:id/status` | `EM_PREPARO` no pedido entregue | 409 `TRANSICAO_DE_STATUS_INVALIDA` | Erros |
| T32 | Token revogado após logout | `GET /account/profile` | token de T01 depois do logout | 401 `NAO_AUTENTICADO` | Erros |
| T33 | Consultar programa de fidelidade | `GET /fidelidade` | token do cliente do seed | 200, `ativa: true`, saldo e regras | Fidelidade |
| T34 | Extrato com os pontos da entrega | `GET /fidelidade/movimentos` | `?page=1&limit=10` | 200, `ACUMULO` de 12 pontos do pedido de T07 | Fidelidade |
| T35 | Pedido com resgate de pontos | `POST /pedidos` | 2 cafés, `pontosResgatados: 20` | 201, desconto `1.00`, total `11.00` | Fidelidade |
| T36 | Cancelamento do pedido com resgate | `PATCH /pedidos/:id/status` | `CANCELADO` e motivo | 200, `CANCELADO` | Fidelidade |
| T37 | Saldo restaurado após o cancelamento | `GET /fidelidade` | token do cliente do seed | 200, saldo igual ao de T33 | Fidelidade |
| T38 | Adesão com consentimento | `POST /fidelidade/adesao` | `{ "consentimento": true }`, token de T01 | 201, `ativa: true`, saldo 0 | Fidelidade |
| T39 | Revogação do consentimento | `DELETE /fidelidade/adesao` | token de T01 | 204 | Fidelidade |
| T40 | Adesão sem consentimento | `POST /fidelidade/adesao` | `{ "consentimento": false }` | 422 `DADOS_INVALIDOS`, campo `consentimento` | Erros |
| T41 | Resgate acima do saldo | `POST /pedidos` | `pontosResgatados: 99999` | 409 `SALDO_DE_PONTOS_INSUFICIENTE` | Erros |
| T42 | Resgate sem adesão ativa | `POST /pedidos` | token de T01, depois de revogar | 409 `FIDELIDADE_INATIVA` | Erros |

Além da coleção, a suíte automatizada da API (`npm test` em `api/`, com Japa) cobre as mesmas regras e as que a coleção não alcança, como pedidos e webhooks simultâneos e falhas do provedor.

## Comandos

A partir de `api/`:

```bash
npm run dev         # servidor de desenvolvimento com recarga automática
npm start           # servidor de produção, a partir do build
npm run build       # compila para build/
npm test            # suíte de testes
npm run lint        # ESLint
npm run typecheck   # TypeScript sem emitir arquivos
npm run format      # Prettier

node ace migration:run      # aplica as migrations pendentes
node ace migration:fresh    # recria o banco do zero
node ace db:seed            # popula os dados de demonstração
node ace list:routes        # lista as rotas registradas
node ace codegen            # regenera os tipos de rotas e controllers
```

Os testes usam o banco `raizes_nordeste_test`, definido em `.env.test`. As migrations rodam e são revertidas automaticamente a cada execução, e cada teste começa com as tabelas limpas.

## Organização do projeto

Dentro de `api/`:

```
app/
  controllers/   entrada HTTP, uma classe por recurso
  exceptions/    ApiException e o handler que padroniza as falhas
  middleware/    autenticação, perfil e assinatura do webhook
  models/        entidades do domínio, relações e regras próprias
  services/      casos de uso que orquestram mais de um model
  transformers/  o que cada resposta expõe
  validators/    schemas VineJS de entrada
config/          configuração do framework e do pagamento
providers/       registro do gateway de pagamento no container
database/
  migrations/    evolução do esquema, fonte da verdade
  der.md         DER em Mermaid, conferido contra o banco por teste
  schema.ts      classes geradas pelo Lucid a partir do banco
  schema_rules.ts  tipagem das colunas enum no arquivo gerado
start/           rotas, kernel HTTP e variáveis de ambiente
tests/
  functional/    testes que sobem o servidor HTTP
  unit/          regras de domínio isoladas
```

As camadas seguem a separação pedida no roteiro: o **domínio** vive em `app/models`, a **infraestrutura** em `database/` e `config/`, e a **API** em `app/controllers`, `app/validators`, `app/transformers` e `start/routes.ts`. A camada de **aplicação**, com os casos de uso que orquestram o fluxo do pedido, vive em `app/services`.

### Schema gerado

No AdonisJS 7 as migrations são a fonte da verdade do esquema. Depois de `node ace migration:run`, o Lucid lê o banco e regenera `database/schema.ts` com as classes de coluna tipadas. Esse arquivo não deve ser editado à mão. Os models estendem essas classes e ficam só com relações e regras de negócio.

Colunas de valores fechados são declaradas como `string` na migration. A lista válida vive no model que a possui, como uma `const` marcada `as const`, e `database/schema_rules.ts` aponta a coluna para o tipo derivado dela. Assim `pedido.canalPedido` é `CanalPedido` no TypeScript, e não `string`, sem que o esquema precise de migration a cada valor novo.

## Modelo de dados

O DER, com chaves, cardinalidades e restrições, está em [`api/database/der.md`](api/database/der.md), desenhado em Mermaid (o GitHub o exibe como diagrama). Como o `openapi.yaml`, ele é verificado por um teste: `tests/functional/der.spec.ts` compara tabelas, colunas, tipos, chaves e a cardinalidade de cada chave estrangeira com o banco migrado, e falha se o diagrama divergir do banco em qualquer um desses pontos.

| Tabela | Papel |
|---|---|
| `users` | Clientes e equipe, com perfil e marcos de consentimento LGPD |
| `unidades` | Unidades da rede, com formato de operação |
| `produtos` | Catálogo da rede |
| `unidade_produtos` | Cardápio por unidade, com preço local |
| `estoques` | Saldo por unidade e produto |
| `movimentacoes_estoque` | Histórico de entrada, saída e ajuste |
| `pedidos` | Pedido com canal de origem, status e totais |
| `pedido_itens` | Itens do pedido, com preço no momento da compra |
| `pagamentos` | Solicitação e retorno do pagamento externo simulado |
| `fidelidade_contas` | Saldo de pontos por cliente |
| `fidelidade_movimentos` | Acúmulo, resgate, expiração e estorno de pontos |
| `promocoes` | Campanhas por rede, unidade ou canal |
| `logs_auditoria` | Registro de ações sensíveis |

Decisões que valem destaque:

- **O canal é dado de domínio.** `pedidos.canal_pedido` é obrigatório e aceita `APP`, `TOTEM`, `BALCAO`, `PICKUP` e `WEB`. A lista vive em `CANAIS_PEDIDO`, no model `Pedido`, e é dali que saem tanto o tipo TypeScript da coluna quanto a validação de entrada.
- **Preço é copiado para o item do pedido.** `pedido_itens.preco_unitario` e `nome_produto` guardam o valor no momento da compra, para que uma alteração de cardápio não reescreva o histórico de vendas.
- **Unidades são heterogêneas.** O cardápio e o estoque são por unidade, então duas unidades podem ofertar produtos diferentes e a preços diferentes sem quebrar o padrão da rede.
- **Pagamento é desacoplado.** A tabela `pagamentos` guarda os payloads de ida e volta do provedor externo, o que permite auditar a negociação inteira sem que o sistema processe pagamento.
- **Invariantes numéricas no banco.** Estoque não fica negativo, item de pedido exige quantidade positiva, saldo de fidelidade não fica negativo e uma unidade não repete o mesmo produto no cardápio ou no estoque.

