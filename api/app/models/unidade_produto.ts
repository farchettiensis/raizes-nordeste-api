import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { UnidadeProdutoSchema } from '#database/schema'
import Produto from '#models/produto'
import Unidade from '#models/unidade'

export default class UnidadeProduto extends UnidadeProdutoSchema {
  static table = 'unidade_produtos'

  @belongsTo(() => Unidade)
  declare unidade: BelongsTo<typeof Unidade>

  @belongsTo(() => Produto)
  declare produto: BelongsTo<typeof Produto>
}
