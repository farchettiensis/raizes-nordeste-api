export type Config = {
  host: string
  port: number
  taxaFalha: number
  webhook: {
    url: string
    segredo: string
    entregas: number
    tentativas: number
    intervaloBaseMs: number
    timeoutMs: number
  }
}

function texto(nome: string, padrao?: string) {
  const valor = process.env[nome] || padrao

  if (valor === undefined) {
    throw new Error(`Variavel de ambiente ${nome} obrigatoria`)
  }

  return valor
}

function numero(nome: string, padrao: number, { min = 0, max = Infinity } = {}) {
  const valor = Number(texto(nome, String(padrao)))

  if (!Number.isFinite(valor) || valor < min || valor > max) {
    throw new Error(`Variavel de ambiente ${nome} deve ser um numero entre ${min} e ${max}`)
  }

  return valor
}

export function lerConfig(): Config {
  return {
    host: texto('HOST', '0.0.0.0'),
    port: numero('PORT', 4000, { min: 1, max: 65535 }),
    taxaFalha: numero('FAILURE_RATE', 0, { max: 1 }),
    webhook: {
      url: texto('WEBHOOK_URL'),
      segredo: texto('WEBHOOK_SECRET'),
      entregas: numero('WEBHOOK_DELIVERIES', 2, { min: 1 }),
      tentativas: numero('WEBHOOK_MAX_ATTEMPTS', 5, { min: 1 }),
      intervaloBaseMs: numero('WEBHOOK_RETRY_BASE_MS', 500),
      timeoutMs: numero('WEBHOOK_TIMEOUT_MS', 5000, { min: 1 }),
    },
  }
}
