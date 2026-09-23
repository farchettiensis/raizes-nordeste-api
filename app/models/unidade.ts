import { hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import { UnidadeSchema } from '#database/schema'
import Estoque from '#models/estoque'
import Pedido from '#models/pedido'
import Promocao from '#models/promocao'
import UnidadeProduto from '#models/unidade_produto'

export const FORMATOS_UNIDADE = ['COMPLETA', 'REDUZIDA'] as const

export type FormatoUnidade = (typeof FORMATOS_UNIDADE)[number]

export default class Unidade extends UnidadeSchema {
  static table = 'unidades'

  @hasMany(() => UnidadeProduto)
  declare cardapio: HasMany<typeof UnidadeProduto>

  @hasMany(() => Estoque)
  declare estoques: HasMany<typeof Estoque>

  @hasMany(() => Pedido)
  declare pedidos: HasMany<typeof Pedido>

  @hasMany(() => Promocao)
  declare promocoes: HasMany<typeof Promocao>
}
