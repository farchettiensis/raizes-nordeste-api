# Pagamento Mock

Provedor de pagamento simulado da rede Raízes do Nordeste. Roda como serviço separado da API e faz o papel do gateway externo: a API solicita o pagamento, recebe de volta um pagamento `PENDENTE` e fica sabendo do resultado depois, por webhook assinado.

O resultado não é sorteado. `POST /simulacoes` faz o papel do cliente pagando no app do banco, ou do emissor recusando, o que torna os dois caminhos reproduzíveis pelo Swagger e pela coleção. O estado vive em memória e se perde ao reiniciar o processo.

A especificação completa está em [`openapi.yaml`](openapi.yaml), servida também em `GET /openapi.yaml`.

## Como executar

Requer Node.js 24 ou superior, que roda TypeScript direto, sem etapa de build.

```bash
npm install
cp .env.example .env
npm run dev
```

| Variável                | Para que serve                                               | Padrão      |
| ----------------------- | ------------------------------------------------------------ | ----------- |
| `PORT`                  | Porta do serviço                                             | `4000`      |
| `WEBHOOK_URL`           | Para onde o resultado é enviado                              | obrigatória |
| `WEBHOOK_SECRET`        | Segredo da assinatura HMAC, o mesmo configurado na API       | obrigatória |
| `WEBHOOK_DELIVERIES`    | Quantas vezes cada evento é entregue                         | `2`         |
| `WEBHOOK_MAX_ATTEMPTS`  | Tentativas por entrega antes de desistir                     | `5`         |
| `WEBHOOK_RETRY_BASE_MS` | Espera inicial entre tentativas, dobrada a cada falha        | `500`       |
| `WEBHOOK_TIMEOUT_MS`    | Tempo máximo de cada tentativa                               | `5000`      |
| `FAILURE_RATE`          | Probabilidade, de 0 a 1, de `POST /pagamentos` responder 503 | `0`         |

## Fluxo

1. `POST /pagamentos` com o cabeçalho `Idempotency-Key`, a `referencia` de quem chama, o `valor` em centavos e o `metodo` (`PIX`, `CARTAO_CREDITO` ou `CARTAO_DEBITO`). Responde `201` com o pagamento `PENDENTE`; para PIX, inclui um código copia e cola fictício.
2. `POST /simulacoes` com o `pagamentoId` e o `resultado` (`APROVADO` ou `RECUSADO`, com `motivo` opcional). Responde `202` e dispara o webhook.
3. O webhook chega em `WEBHOOK_URL` com o evento no corpo e os cabeçalhos `X-Evento-Id` e `X-Assinatura: t=<unix>,v1=<hex>`, onde `v1` é o HMAC-SHA256 de `<t>.<corpo>`.

## Comportamentos de provedor real

- **Idempotência na entrada:** repetir a chave com o mesmo conteúdo devolve o pagamento original (`200`); com outro conteúdo, `409`. Quem chama pode retentar depois de um timeout sem cobrar duas vezes.
- **Entrega ao menos uma vez:** falhas no webhook são retentadas com espera exponencial, e cada evento é enviado `WEBHOOK_DELIVERIES` vezes de propósito. O receptor precisa tratar duplicatas.
- **Falhas transitórias:** com `FAILURE_RATE` acima de zero, parte das solicitações responde `503` sem registrar nada.
- **Sem dados de cartão:** a captura do cartão é responsabilidade do app cliente junto ao provedor. Nem este serviço nem a API recebem número de cartão.

## Comandos

```bash
npm run dev         # servidor com recarga automática
npm start           # servidor
npm test            # testes (node:test)
npm run lint        # ESLint
npm run typecheck   # TypeScript sem emitir arquivos
npm run format      # Prettier
```
