import env from '#start/env'

const pagamentoConfig = {
  gateway: {
    url: env.get('PAGAMENTO_GATEWAY_URL'),
    timeoutMs: 5000,
    tentativas: 3,
    intervaloBaseMs: 200,
  },
  webhook: {
    segredo: env.get('PAGAMENTO_WEBHOOK_SECRET'),
    toleranciaEmSegundos: 300,
  },
}

export default pagamentoConfig
