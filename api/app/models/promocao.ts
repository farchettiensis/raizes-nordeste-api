import { DateTime } from 'luxon'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { PromocoeSchema } from '#database/schema'
import type { CanalPedido } from '#models/pedido'
import Unidade from '#models/unidade'

export const TIPOS_PROMOCAO = ['PERCENTUAL', 'VALOR_FIXO', 'PONTOS_EXTRA'] as const

export type TipoPromocao = (typeof TIPOS_PROMOCAO)[number]

export default class Promocao extends PromocoeSchema {
  static table = 'promocoes'

  @belongsTo(() => Unidade)
  declare unidade: BelongsTo<typeof Unidade>

  vigenteEm(momento: DateTime = DateTime.now()) {
    return this.ativa && this.iniciaEm <= momento && this.terminaEm >= momento
  }

  aplicavelA(canal: CanalPedido, unidadeId: number, valorPedido: number) {
    return (
      this.vigenteEm() &&
      (this.canalPedido === null || this.canalPedido === canal) &&
      (this.unidadeId === null || this.unidadeId === unidadeId) &&
      valorPedido >= Number(this.valorMinimoPedido)
    )
  }
}
