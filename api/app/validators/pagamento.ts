import vine from '@vinejs/vine'

import { METODOS_PAGAMENTO_EXTERNO } from '#models/pagamento'

export const solicitarPagamentoValidator = vine.create({
  metodo: vine.enum(METODOS_PAGAMENTO_EXTERNO),
})

export const eventoDePagamentoValidator = vine.create({
  id: vine.string().minLength(1),
  tipo: vine.enum(['pagamento.aprovado', 'pagamento.recusado'] as const),
  pagamento: vine.object({
    id: vine.string().minLength(1),
    referencia: vine.string().regex(/^\d+$/),
    valor: vine.number().withoutDecimals().positive(),
    status: vine.enum(['APROVADO', 'RECUSADO'] as const),
    motivoRecusa: vine.string().nullable(),
    processadoEm: vine.string(),
  }),
})
