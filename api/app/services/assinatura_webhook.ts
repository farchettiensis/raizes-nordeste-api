import { createHmac, timingSafeEqual } from 'node:crypto'

export type OpcoesDeVerificacao = {
  toleranciaEmSegundos: number
  agoraEmSegundos?: number
}

export function assinar(segredo: string, timestamp: number, corpo: string) {
  return createHmac('sha256', segredo).update(`${timestamp}.${corpo}`).digest('hex')
}

export function assinaturaValida(
  cabecalho: string | undefined,
  corpo: string,
  segredo: string,
  { toleranciaEmSegundos, agoraEmSegundos = Date.now() / 1000 }: OpcoesDeVerificacao
) {
  const partes = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(cabecalho ?? '')

  if (!partes) {
    return false
  }

  const timestamp = Number(partes[1])

  if (Math.abs(agoraEmSegundos - timestamp) > toleranciaEmSegundos) {
    return false
  }

  const esperada = Buffer.from(assinar(segredo, timestamp, corpo), 'hex')

  return timingSafeEqual(esperada, Buffer.from(partes[2], 'hex'))
}
