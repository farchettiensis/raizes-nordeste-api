import vine from '@vinejs/vine'

import { CANAIS_PEDIDO, STATUS_DEFINIDOS_PELA_OPERACAO, STATUS_PEDIDO } from '#models/pedido'
import { paginacao } from '#validators/paginacao'

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
  ...paginacao(),
  canalPedido: vine.enum(CANAIS_PEDIDO).optional(),
  status: vine.enum(STATUS_PEDIDO).optional(),
  unidadeId: identificador().optional(),
})

export const atualizarStatusValidator = vine.create({
  status: vine.enum(STATUS_DEFINIDOS_PELA_OPERACAO),
})
