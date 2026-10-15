import vine from '@vinejs/vine'

import { paginacao } from '#validators/paginacao'

export const listarUnidadesValidator = vine.create({
  ...paginacao(),
  estado: vine.string().trim().fixedLength(2).toUpperCase().optional(),
  cidade: vine.string().trim().minLength(1).optional(),
  ativa: vine.boolean().optional(),
})

export const listarCardapioValidator = vine.create({
  ...paginacao(),
})

export const listarEstoqueValidator = vine.create({
  ...paginacao(),
})
