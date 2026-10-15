import { belongsTo, hasMany, hasOne, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, HasOne } from '@adonisjs/lucid/types/relations'
import { PedidoSchema } from '#database/schema'
import Pagamento from '#models/pagamento'
import PedidoItem from '#models/pedido_item'
import Unidade from '#models/unidade'
import User, { type PerfilUsuario } from '#models/user'

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

export const STATUS_DEFINIDOS_PELA_OPERACAO = [
  'EM_PREPARO',
  'PRONTO',
  'ENTREGUE',
] as const satisfies readonly StatusPedido[]

const CANCELAM_DEPOIS_DE_PAGO: PerfilUsuario[] = ['GERENTE', 'ADMIN']

export const PERFIS_POR_TRANSICAO: Record<
  StatusPedido,
  Partial<Record<StatusPedido, PerfilUsuario[]>>
> = {
  AGUARDANDO_PAGAMENTO: { CANCELADO: ['CLIENTE', 'ATENDENTE', 'GERENTE', 'ADMIN'] },
  PAGO: { EM_PREPARO: ['COZINHA', 'GERENTE'], CANCELADO: CANCELAM_DEPOIS_DE_PAGO },
  EM_PREPARO: { PRONTO: ['COZINHA', 'GERENTE'], CANCELADO: CANCELAM_DEPOIS_DE_PAGO },
  PRONTO: { ENTREGUE: ['ATENDENTE', 'GERENTE'], CANCELADO: CANCELAM_DEPOIS_DE_PAGO },
  ENTREGUE: {},
  CANCELADO: {},
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

  static visiveisPara = scope((query, usuario: User) => {
    if (usuario.temPerfil('ADMIN')) {
      return
    }

    if (usuario.temPerfil('CLIENTE')) {
      query.where('clienteId', usuario.id)
    } else if (usuario.vinculadoAUnidade && usuario.unidadeId !== null) {
      query.where('unidadeId', usuario.unidadeId)
    } else {
      query.whereRaw('false')
    }
  })

  get finalizado() {
    return TRANSICOES_STATUS_PEDIDO[this.status].length === 0
  }

  pertenceA(usuario: User) {
    return this.clienteId === usuario.id
  }

  visivelPara(usuario: User) {
    return usuario.temPerfil('CLIENTE')
      ? this.pertenceA(usuario)
      : usuario.operaUnidade(this.unidadeId)
  }

  podeTransicionarPara(destino: StatusPedido) {
    return TRANSICOES_STATUS_PEDIDO[this.status].includes(destino)
  }

  podeSerTransicionadoPor(usuario: User, destino: StatusPedido) {
    const perfis = PERFIS_POR_TRANSICAO[this.status][destino] ?? []

    return (
      this.podeTransicionarPara(destino) &&
      usuario.temPerfil(...perfis) &&
      this.visivelPara(usuario)
    )
  }
}
