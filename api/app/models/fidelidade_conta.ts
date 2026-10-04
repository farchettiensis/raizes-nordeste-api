import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { FidelidadeContaSchema } from '#database/schema'
import FidelidadeMovimento from '#models/fidelidade_movimento'
import User from '#models/user'

export default class FidelidadeConta extends FidelidadeContaSchema {
  static table = 'fidelidade_contas'

  @belongsTo(() => User, { foreignKey: 'clienteId' })
  declare cliente: BelongsTo<typeof User>

  @hasMany(() => FidelidadeMovimento, { foreignKey: 'contaId' })
  declare movimentos: HasMany<typeof FidelidadeMovimento>

  podeResgatar(pontos: number) {
    return pontos > 0 && this.saldoPontos >= pontos
  }
}
