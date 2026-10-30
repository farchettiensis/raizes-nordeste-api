import type LogAuditoria from '#models/log_auditoria'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class LogAuditoriaTransformer extends BaseTransformer<LogAuditoria> {
  toObject() {
    const { id, acao, entidade, entidadeId, usuarioId, dados, ip, requestId, createdAt } =
      this.resource

    return {
      logId: id,
      acao,
      entidade,
      entidadeId: entidadeId ?? null,
      usuarioId: usuarioId ?? null,
      dados: (dados ?? null) as Record<string, unknown> | null,
      ip: ip ?? null,
      requestId: requestId ?? null,
      createdAt: createdAt.toISO(),
    }
  }
}
