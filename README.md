# API Raízes do Nordeste

API REST da rede de lanchonetes Raízes do Nordeste, construída com AdonisJS 7, PostgreSQL e Lucid ORM.

Projeto Multidisciplinar 2026, trilha Back-End (UNINTER).

## Requisitos

- Node.js 24 ou superior
- npm 11 ou superior
- PostgreSQL 14 ou superior, acessível localmente

## Como executar

```bash
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

A API sobe em `http://localhost:3333`.

O seeder cria quatro unidades (uma delas inativa, de propósito), oito produtos, o cardápio e o estoque de cada unidade, e um usuário para cada perfil. Rodá-lo mais de uma vez não duplica nada. Todas as contas usam a senha `Senha@123`:

| E-mail | Perfil |
|---|---|
| `admin@raizes.test` | ADMIN |
| `gerente@raizes.test` | GERENTE |
| `atendente@raizes.test` | ATENDENTE |
| `cozinha@raizes.test` | COZINHA |
| `cliente@raizes.test` | CLIENTE |

## Documentação da API

Com o servidor rodando, abra `http://localhost:3333/docs`. A raiz `/` redireciona para lá.

O contrato fica em [`openapi.yaml`](openapi.yaml), na raiz do projeto, e é servido em `/docs/openapi.yaml`. O Swagger UI é servido a partir do pacote instalado localmente, sem depender de CDN, então a documentação funciona offline.

O documento é escrito à mão, e não gerado por biblioteca. Em troca disso, um teste automatizado compara os caminhos declarados no `openapi.yaml` com as rotas realmente registradas no router e falha se as duas listas divergirem, de modo que o contrato não envelhece em silêncio.

## Padrão de erro

Toda falha, em qualquer endpoint, responde com o mesmo corpo:

```json
{
  "error": "ESTOQUE_INSUFICIENTE",
  "message": "Não há quantidade suficiente para um ou mais itens.",
  "details": [{ "field": "itens[0].quantidade", "issue": "Disponível: 1" }],
  "timestamp": "2026-02-05T12:00:00.000Z",
  "path": "/api/v1/pedidos",
  "requestId": "33be9a44-6849-439c-960c-cb2d995aa732"
}
```

O campo `error` é um identificador estável, pensado para o cliente tratar programaticamente; `message` é a mensagem legível; `details` traz um item por campo reprovado e vem vazio quando o erro não é de validação.

## Comandos

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

```
app/
  controllers/   entrada HTTP, uma classe por recurso
  exceptions/    ApiException e o handler que padroniza as falhas
  middleware/    autenticação e preparo da requisição
  models/        entidades do domínio, relações e regras próprias
  transformers/  o que cada resposta expõe
  validators/    schemas VineJS de entrada
config/          configuração do framework
database/
  migrations/    evolução do esquema, fonte da verdade
  schema.ts      classes geradas pelo Lucid a partir do banco
  schema_rules.ts  tipagem das colunas enum no arquivo gerado
start/           rotas, kernel HTTP e variáveis de ambiente
tests/
  functional/    testes que sobem o servidor HTTP
  unit/          regras de domínio isoladas
```

As camadas seguem a separação pedida no roteiro: o **domínio** vive em `app/models`, a **infraestrutura** em `database/` e `config/`, e a **API** em `app/controllers`, `app/validators`, `app/transformers` e `start/routes.ts`. A camada de **aplicação**, com os casos de uso que orquestram o fluxo do pedido, entra em `app/services`.

### Schema gerado

No AdonisJS 7 as migrations são a fonte da verdade do esquema. Depois de `node ace migration:run`, o Lucid lê o banco e regenera `database/schema.ts` com as classes de coluna tipadas. Esse arquivo não deve ser editado à mão. Os models estendem essas classes e ficam só com relações e regras de negócio.

Colunas de valores fechados são declaradas como `string` na migration. A lista válida vive no model que a possui, como uma `const` marcada `as const`, e `database/schema_rules.ts` aponta a coluna para o tipo derivado dela. Assim `pedido.canalPedido` é `CanalPedido` no TypeScript, e não `string`, sem que o esquema precise de migration a cada valor novo.

## Modelo de dados

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

