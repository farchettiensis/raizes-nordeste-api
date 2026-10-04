import { hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import { ProdutoSchema } from '#database/schema'
import Estoque from '#models/estoque'
import UnidadeProduto from '#models/unidade_produto'

export default class Produto extends ProdutoSchema {
  static table = 'produtos'

  @hasMany(() => UnidadeProduto)
  declare ofertas: HasMany<typeof UnidadeProduto>

  @hasMany(() => Estoque)
  declare estoques: HasMany<typeof Estoque>
}
