import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { FidelidadeMovimentoSchema } from '#database/schema'
import FidelidadeConta from '#models/fidelidade_conta'
import Pedido from '#models/pedido'

export const TIPOS_MOVIMENTO_FIDELIDADE = ['ACUMULO', 'RESGATE', 'EXPIRACAO', 'ESTORNO'] as const

export type TipoMovimentoFidelidade = (typeof TIPOS_MOVIMENTO_FIDELIDADE)[number]

export default class FidelidadeMovimento extends FidelidadeMovimentoSchema {
  static table = 'fidelidade_movimentos'

  @belongsTo(() => FidelidadeConta, { foreignKey: 'contaId' })
  declare conta: BelongsTo<typeof FidelidadeConta>

  @belongsTo(() => Pedido)
  declare pedido: BelongsTo<typeof Pedido>
}
