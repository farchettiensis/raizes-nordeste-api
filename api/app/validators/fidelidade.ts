import vine from '@vinejs/vine'

import { paginacao } from '#validators/paginacao'

export const aderirFidelidadeValidator = vine.create({
  consentimento: vine.literal(true),
})

export const listarMovimentosValidator = vine.create({
  ...paginacao(),
})
