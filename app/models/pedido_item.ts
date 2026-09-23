import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { PedidoItenSchema } from '#database/schema'
import Pedido from '#models/pedido'
import Produto from '#models/produto'

export default class PedidoItem extends PedidoItenSchema {
  static table = 'pedido_itens'

  @belongsTo(() => Pedido)
  declare pedido: BelongsTo<typeof Pedido>

  @belongsTo(() => Produto)
  declare produto: BelongsTo<typeof Produto>
}
