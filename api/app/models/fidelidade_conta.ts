import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { FidelidadeContaSchema } from '#database/schema'
import FidelidadeMovimento, { type TipoMovimentoFidelidade } from '#models/fidelidade_movimento'
import User from '#models/user'

export const PONTOS_POR_REAL = 1
export const VALOR_DO_PONTO_EM_CENTAVOS = 5
export const LIMITE_DE_DESCONTO_PERCENTUAL = 50

export type Lancamento = {
  tipo: TipoMovimentoFidelidade
  pontos: number
  pedidoId?: number | null
  descricao: string
}

export default class FidelidadeConta extends FidelidadeContaSchema {
  static table = 'fidelidade_contas'

  @belongsTo(() => User, { foreignKey: 'clienteId' })
  declare cliente: BelongsTo<typeof User>

  @hasMany(() => FidelidadeMovimento, { foreignKey: 'contaId' })
  declare movimentos: HasMany<typeof FidelidadeMovimento>

  static ativaTravadaDo(clienteId: number, trx: TransactionClientContract) {
    return this.query({ client: trx })
      .where('clienteId', clienteId)
      .whereHas('cliente', (cliente) => cliente.whereNotNull('consentimentoFidelidadeEm'))
      .forUpdate()
      .first()
  }

  static pontosDaCompra(totalEmCentavos: number) {
    return Math.floor(totalEmCentavos / 100) * PONTOS_POR_REAL
  }

  static descontoEmCentavos(pontos: number) {
    return pontos * VALOR_DO_PONTO_EM_CENTAVOS
  }

  static maximoDePontosPara(subtotalEmCentavos: number) {
    const limiteEmCentavos = (subtotalEmCentavos * LIMITE_DE_DESCONTO_PERCENTUAL) / 100

    return Math.floor(limiteEmCentavos / VALOR_DO_PONTO_EM_CENTAVOS)
  }

  podeResgatar(pontos: number) {
    return pontos > 0 && this.saldoPontos >= pontos
  }

  async lancar({ tipo, pontos, pedidoId = null, descricao }: Lancamento) {
    this.saldoPontos += pontos
    await this.save()

    return FidelidadeMovimento.create(
      { contaId: this.id, tipo, pontos, saldoResultante: this.saldoPontos, pedidoId, descricao },
      { client: this.$trx }
    )
  }
}
