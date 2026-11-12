# API Raízes do Nordeste

API REST da rede de lanchonetes Raízes do Nordeste, construída com AdonisJS 7, PostgreSQL e Lucid ORM.

Projeto Multidisciplinar 2026, trilha Back-End (UNINTER).

## Estrutura do repositório

| Pasta | O que é |
|---|---|
| `api/` | A API REST, em AdonisJS |
| `pagamento-mock/` | Provedor de pagamento simulado, serviço separado em Fastify (veja o [README dele](pagamento-mock/README.md), que explica a escolha) |
| `postman/` | Coleção Postman com o [plano de testes](#plano-de-testes) executável |
| `docs/` | Regras de negócio e decisões de projeto, um arquivo por assunto (veja [Regras e decisões](#regras-e-decisões)) |

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
node ace generate:key
```

O `generate:key` grava o `APP_KEY` no `.env`; sem ele a API não inicia. Abra o `.env` e ajuste as variáveis de banco para o seu PostgreSQL. Os valores padrão assumem um servidor local em `127.0.0.1:5432` com o usuário `postgres`.

| Variável | Para que serve | Padrão |
|---|---|---|
| `PORT` | Porta em que a API escuta | `3333` |
| `APP_KEY` | Chave de criptografia da aplicação | gerada por `node ace generate:key` |
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

### Dados de demonstração

O seeder cria quatro unidades (uma delas inativa, de propósito), oito produtos, o cardápio e o estoque de cada unidade, e um usuário para cada perfil. Rodá-lo mais de uma vez não duplica nada. Todas as contas usam a senha `Senha@123`:

| E-mail | Perfil |
|---|---|
| `admin@raizes.test` | ADMIN |
| `gerente@raizes.test` | GERENTE |
| `atendente@raizes.test` | ATENDENTE |
| `cozinha@raizes.test` | COZINHA |
| `cliente@raizes.test` | CLIENTE |

O cliente já vem inscrito na [fidelidade](docs/fidelidade-e-promocoes.md), com 200 pontos de saldo inicial, para o resgate poder ser demonstrado de imediato.

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
| DELETE | `/api/v1/clientes/conta` | token, perfil CLIENTE e senha atual | Encerra e anonimiza o próprio cadastro |
| GET | `/api/v1/unidades` | pública | Lista unidades, com filtros e paginação |
| GET | `/api/v1/unidades/:id` | pública | Detalhe de uma unidade |
| GET | `/api/v1/unidades/:id/cardapio` | pública | Cardápio da unidade, com preço e disponibilidade |
| POST | `/api/v1/unidades/:id/estoque/movimentacoes` | token, GERENTE da própria unidade ou ADMIN | Registra entrada ou ajuste com motivo e auditoria |
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

## Fluxo principal

O MVP é o fluxo pedido, pagamento externo simulado e atualização de status. Com a pilha no ar (`docker compose up --build`):

1. Faça login com `cliente@raizes.test` e crie um pedido em `POST /api/v1/pedidos`.
2. Peça o pagamento em `POST /api/v1/pedidos/{id}/pagamento` com `{ "metodo": "PIX" }`. A resposta é `202` com o pagamento `PENDENTE` e a `referenciaExterna`, o identificador no provedor.
3. Decida o resultado no mock: `POST http://localhost:4000/simulacoes` com `{ "pagamentoId": "<referenciaExterna>", "resultado": "APROVADO" }` (ou `"RECUSADO"`, com `motivo` opcional). É o papel do cliente pagando no app do banco, ou do emissor recusando.
4. Consulte `GET /api/v1/pedidos/{id}`: aprovado deixa o pedido `PAGO`; recusado deixa o pedido `CANCELADO`, o pagamento `RECUSADO` com o motivo, e o estoque de volta ao saldo anterior.

## Regras e decisões

O README cobre execução e verificação. As regras de negócio, as justificativas e as limitações conhecidas ficam em `docs/`, um arquivo por assunto:

| Assunto | Em resumo | Documento |
|---|---|---|
| Autorização e estoque | Perfil confere a rota, escopo confere a unidade ou o dono; entradas e ajustes com motivo, sem saldo negativo | [autorizacao-e-estoque.md](docs/autorizacao-e-estoque.md) |
| Pedidos | Preço calculado no servidor, estoque baixado na criação com trava, transições de status por perfil, cancelamento com estorno | [pedidos.md](docs/pedidos.md) |
| Pagamento | Solicitação `202`, resultado por webhook assinado (HMAC), idempotência nas duas pontas, falhas do provedor | [pagamento.md](docs/pagamento.md) |
| Fidelidade e promoções | Pontos com consentimento, resgate como desconto; promoções como regra proposta, ainda não aplicada ao preço | [fidelidade-e-promocoes.md](docs/fidelidade-e-promocoes.md) |
| LGPD e auditoria | Dados tratados, finalidade e base legal, consentimento, anonimização, retenção e trilha de ações sensíveis | [lgpd-e-auditoria.md](docs/lgpd-e-auditoria.md) |
| Modelo de dados | Decisões do DER e o schema gerado pelo Lucid | [modelo-de-dados.md](docs/modelo-de-dados.md) |

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

Os cenários numerados são as requisições de mesmo nome na coleção (pasta/nome). As demais (logins de outros perfis, pedidos e pagamentos de apoio, chamadas ao mock) só preparam o cenário seguinte. São 28 positivos e 20 negativos.

| ID | Cenário | Endpoint | Entrada | Esperado | Pasta |
|---|---|---|---|---|---|
| T01 | Cadastro de cliente | `POST /auth/signup` | nome, e-mail novo, senha, `consentimentoDados: true` | 201, token, sem senha na resposta | Auth |
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
| T43 | Encerrar cadastro do cliente novo | `DELETE /clientes/conta` | novo login da conta de T01 após T32, senha atual | 204, conta encerrada | LGPD |
| T44 | Token da conta encerrada | `GET /account/profile` | token de T01 após T43 | 401 | LGPD |
| T45 | Entrada de estoque | `POST /unidades/:id/estoque/movimentacoes` | gerente, ENTRADA de 5 | 201, saldo acrescido em 5 | Estoque |
| T46 | Ajuste de estoque | `POST /unidades/:id/estoque/movimentacoes` | gerente, AJUSTE de -5 após T45 | 201, saldo anterior restaurado | Estoque |
| T47 | Atendente tenta movimentar | `POST /unidades/:id/estoque/movimentacoes` | token da atendente | 403 `SEM_PERMISSAO` | Estoque |
| T48 | Ajuste maior que o saldo | `POST /unidades/:id/estoque/movimentacoes` | quantidade negativa superior ao saldo | 409 `ESTOQUE_INSUFICIENTE` | Estoque |

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

As decisões de modelagem estão em [docs/modelo-de-dados.md](docs/modelo-de-dados.md).
