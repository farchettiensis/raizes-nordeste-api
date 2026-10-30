import vine from '@vinejs/vine'

import { ACOES_AUDITORIA, ENTIDADES_AUDITADAS } from '#models/log_auditoria'
import { paginacao } from '#validators/paginacao'

export const listarAuditoriaValidator = vine.create({
  ...paginacao(),
  acao: vine.enum(ACOES_AUDITORIA).optional(),
  entidade: vine.enum(ENTIDADES_AUDITADAS).optional(),
  entidadeId: vine.string().trim().maxLength(40).optional(),
  usuarioId: vine.number().withoutDecimals().positive().optional(),
})
