import { criarApp } from './app.ts'
import { lerConfig } from './config.ts'
import { RegistroDePagamentos } from './pagamentos.ts'
import { EntregadorDeWebhook } from './webhook.ts'

const config = lerConfig()

const app = criarApp({
  registro: new RegistroDePagamentos(),
  entregador: new EntregadorDeWebhook(config.webhook),
  taxaFalha: config.taxaFalha,
  logger: true,
})

for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sinal, () => void app.close())
}

await app.listen({ host: config.host, port: config.port })
