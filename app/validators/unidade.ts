import vine from '@vinejs/vine'

const page = () => vine.number().min(1).optional()
const limit = () => vine.number().min(1).max(100).optional()

export const listarUnidadesValidator = vine.create({
  page: page(),
  limit: limit(),
  estado: vine.string().trim().fixedLength(2).toUpperCase().optional(),
  cidade: vine.string().trim().minLength(1).optional(),
  ativa: vine.boolean().optional(),
})

export const listarCardapioValidator = vine.create({
  page: page(),
  limit: limit(),
})
