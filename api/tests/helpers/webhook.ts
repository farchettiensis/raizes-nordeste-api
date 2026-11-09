import type { ApiClient } from '@japa/api-client'

import pagamentoConfig from '#config/pagamento'
import type Pagamento from '#models/pagamento'
import { assinar } from '#services/assinatura_webhook'
import { emCentavos } from '#services/centavos'

export type ResultadoDoProvedor = 'APROVADO' | 'RECUSADO'

export const SEGREDO = pagamentoConfig.webhook.segredo.release()
export const MOTIVO = 'Saldo insuficiente'

export function agoraEmSegundos() {
  return Math.floor(Date.now() / 1000)
}

export function eventoPara(
  pagamento: Pagamento,
  status: ResultadoDoProvedor,
  sobrescritas: Record<string, unknown> = {}
) {
  return {
    id: `evt_${pagamento.id}_${status}`,
    tipo: status === 'APROVADO' ? 'pagamento.aprovado' : 'pagamento.recusado',
    criadoEm: '2026-10-04T12:00:00.000Z',
    pagamento: {
      id: pagamento.referenciaExterna,
      referencia: String(pagamento.id),
      valor: emCentavos(pagamento.valor),
      metodo: pagamento.metodo,
      status,
      motivoRecusa: status === 'RECUSADO' ? MOTIVO : null,
      processadoEm: '2026-10-04T12:00:00.000Z',
      ...sobrescritas,
    },
  }
}

export function enviarWebhook(
  client: ApiClient,
  evento: object,
  { segredo = SEGREDO, timestamp = agoraEmSegundos() } = {}
) {
  const corpo = JSON.stringify(evento)

  return client
    .post('/api/v1/pagamentos/webhook')
    .header('x-assinatura', `t=${timestamp},v1=${assinar(segredo, timestamp, corpo)}`)
    .unsafeJson(corpo)
}
