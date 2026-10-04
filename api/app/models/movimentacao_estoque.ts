import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { MovimentacoesEstoqueSchema } from '#database/schema'
import Estoque from '#models/estoque'
import Pedido from '#models/pedido'
import User from '#models/user'

export const TIPOS_MOVIMENTACAO_ESTOQUE = ['ENTRADA', 'SAIDA', 'AJUSTE'] as const

export type TipoMovimentacaoEstoque = (typeof TIPOS_MOVIMENTACAO_ESTOQUE)[number]

export default class MovimentacaoEstoque extends MovimentacoesEstoqueSchema {
  static table = 'movimentacoes_estoque'

  @belongsTo(() => Estoque)
  declare estoque: BelongsTo<typeof Estoque>

  @belongsTo(() => Pedido)
  declare pedido: BelongsTo<typeof Pedido>

  @belongsTo(() => User, { foreignKey: 'usuarioId' })
  declare usuario: BelongsTo<typeof User>
}
