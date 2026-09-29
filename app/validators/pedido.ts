import vine from '@vinejs/vine'

import { CANAIS_PEDIDO } from '#models/pedido'

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
