import { belongsTo, hasMany, hasOne } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, HasOne } from '@adonisjs/lucid/types/relations'
import { PedidoSchema } from '#database/schema'
import Pagamento from '#models/pagamento'
import PedidoItem from '#models/pedido_item'
import Unidade from '#models/unidade'
import User from '#models/user'

export const CANAIS_PEDIDO = ['APP', 'TOTEM', 'BALCAO', 'PICKUP', 'WEB'] as const

export type CanalPedido = (typeof CANAIS_PEDIDO)[number]

export const STATUS_PEDIDO = [
  'AGUARDANDO_PAGAMENTO',
  'PAGO',
  'EM_PREPARO',
  'PRONTO',
  'ENTREGUE',
  'CANCELADO',
] as const

export type StatusPedido = (typeof STATUS_PEDIDO)[number]

export const TRANSICOES_STATUS_PEDIDO: Record<StatusPedido, StatusPedido[]> = {
  AGUARDANDO_PAGAMENTO: ['PAGO', 'CANCELADO'],
  PAGO: ['EM_PREPARO', 'CANCELADO'],
  EM_PREPARO: ['PRONTO', 'CANCELADO'],
  PRONTO: ['ENTREGUE', 'CANCELADO'],
  ENTREGUE: [],
  CANCELADO: [],
}

export default class Pedido extends PedidoSchema {
  static table = 'pedidos'

  @belongsTo(() => Unidade)
  declare unidade: BelongsTo<typeof Unidade>

  @belongsTo(() => User, { foreignKey: 'clienteId' })
  declare cliente: BelongsTo<typeof User>

  @hasMany(() => PedidoItem)
  declare itens: HasMany<typeof PedidoItem>

  @hasOne(() => Pagamento)
  declare pagamento: HasOne<typeof Pagamento>

  get finalizado() {
    return TRANSICOES_STATUS_PEDIDO[this.status].length === 0
  }

  podeTransicionarPara(destino: StatusPedido) {
    return TRANSICOES_STATUS_PEDIDO[this.status].includes(destino)
  }
}
