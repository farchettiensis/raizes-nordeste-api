import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { PagamentoSchema } from '#database/schema'
import Pedido from '#models/pedido'

export const STATUS_PAGAMENTO = ['PENDENTE', 'APROVADO', 'RECUSADO', 'ESTORNADO'] as const

export type StatusPagamento = (typeof STATUS_PAGAMENTO)[number]

export const METODOS_PAGAMENTO = ['PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'DINHEIRO'] as const

export type MetodoPagamento = (typeof METODOS_PAGAMENTO)[number]

export const METODOS_PAGAMENTO_EXTERNO = [
  'PIX',
  'CARTAO_CREDITO',
  'CARTAO_DEBITO',
] as const satisfies readonly MetodoPagamento[]

export type MetodoPagamentoExterno = (typeof METODOS_PAGAMENTO_EXTERNO)[number]

export default class Pagamento extends PagamentoSchema {
  static table = 'pagamentos'

  @belongsTo(() => Pedido)
  declare pedido: BelongsTo<typeof Pedido>

  get aprovado() {
    return this.status === 'APROVADO'
  }

  get pendente() {
    return this.status === 'PENDENTE'
  }

  get pixCopiaECola(): string | null {
    return this.payloadResposta?.pix?.copiaECola ?? null
  }
}
