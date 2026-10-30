import { HttpContext } from '@adonisjs/core/http'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

import LogAuditoria, { type AcaoAuditoria, type EntidadeAuditada } from '#models/log_auditoria'
import type User from '#models/user'

export type RegistroDeAuditoria = {
  acao: AcaoAuditoria
  entidade: EntidadeAuditada
  entidadeId?: number | null
  usuario?: User | null
  dados?: Record<string, unknown> | null
}

export function registrarAuditoria(
  { acao, entidade, entidadeId, usuario, dados }: RegistroDeAuditoria,
  trx?: TransactionClientContract
) {
  const ctx = HttpContext.get()

  return LogAuditoria.create(
    {
      acao,
      entidade,
      entidadeId: entidadeId === undefined || entidadeId === null ? null : String(entidadeId),
      usuarioId: usuario?.id ?? null,
      dados: dados ?? null,
      ip: ctx?.request.ip() ?? null,
      requestId: ctx?.request.id() ?? null,
    },
    { client: trx }
  )
}
