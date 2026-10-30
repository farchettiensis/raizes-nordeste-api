import { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

import LogAuditoria, { type AcaoAuditoria, type EntidadeAuditada } from '#models/log_auditoria'
import type User from '#models/user'

const TAMANHO_DO_REQUEST_ID = 40

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
      entidadeId: entidadeId?.toString() ?? null,
      usuarioId: usuario?.id ?? null,
      dados: dados ?? null,
      ip: ctx?.request.ip() ?? null,
      requestId: ctx?.request.id()?.slice(0, TAMANHO_DO_REQUEST_ID) ?? null,
    },
    { client: trx }
  )
}

export async function registrarAuditoriaSemInterromper(registro: RegistroDeAuditoria) {
  try {
    await registrarAuditoria(registro)
  } catch (falha) {
    logger.error({ err: falha, acao: registro.acao }, 'Registro de auditoria nao gravado')
  }
}
