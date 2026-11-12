import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { LogsAuditoriaSchema } from '#database/schema'
import User from '#models/user'

export const ACOES_AUDITORIA = [
  'usuario.cadastrado',
  'usuario.anonimizado',
  'auth.login',
  'auth.login_negado',
  'auth.logout',
  'pedido.criado',
  'pedido.status_alterado',
  'pedido.cancelado',
  'pagamento.solicitado',
  'pagamento.aprovado',
  'pagamento.recusado',
  'pagamento.estornado',
  'fidelidade.aderida',
  'fidelidade.revogada',
  'estoque.movimentado',
  'acesso.negado',
] as const

export type AcaoAuditoria = (typeof ACOES_AUDITORIA)[number]

export const ENTIDADES_AUDITADAS = [
  'user',
  'pedido',
  'pagamento',
  'fidelidade',
  'estoque',
  'rota',
] as const

export type EntidadeAuditada = (typeof ENTIDADES_AUDITADAS)[number]

export default class LogAuditoria extends LogsAuditoriaSchema {
  static table = 'logs_auditoria'

  @belongsTo(() => User, { foreignKey: 'usuarioId' })
  declare usuario: BelongsTo<typeof User>
}
