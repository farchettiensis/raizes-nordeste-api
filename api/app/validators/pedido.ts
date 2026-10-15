import vine from '@vinejs/vine'

import { CANAIS_PEDIDO, STATUS_PEDIDO } from '#models/pedido'

const identificador = () => vine.number().withoutDecimals().positive()

export const criarPedidoValidator = vine.create({
  unidadeId: identificador(),
  canalPedido: vine.enum(CANAIS_PEDIDO),
  itens: vine
    .array(
      vine.object({
        produtoId: identificador(),
        quantidade: vine.number().withoutDecimals().min(1).max(99),
      })
    )
    .minLength(1)
    .distinct('produtoId'),
  observacoes: vine.string().trim().maxLength(500).optional(),
})

export const listarPedidosValidator = vine.create({
  page: vine.number().min(1).optional(),
  limit: vine.number().min(1).max(100).optional(),
  canalPedido: vine.enum(CANAIS_PEDIDO).optional(),
  status: vine.enum(STATUS_PEDIDO).optional(),
  unidadeId: identificador().optional(),
})
