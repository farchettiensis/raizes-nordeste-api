import vine from '@vinejs/vine'

import { METODOS_PAGAMENTO_EXTERNO } from '#models/pagamento'

export const solicitarPagamentoValidator = vine.create({
  metodo: vine.enum(METODOS_PAGAMENTO_EXTERNO),
})
