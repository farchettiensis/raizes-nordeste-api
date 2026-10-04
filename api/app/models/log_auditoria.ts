import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { LogsAuditoriaSchema } from '#database/schema'
import User from '#models/user'

export default class LogAuditoria extends LogsAuditoriaSchema {
  static table = 'logs_auditoria'

  @belongsTo(() => User, { foreignKey: 'usuarioId' })
  declare usuario: BelongsTo<typeof User>
}
