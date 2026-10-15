import vine from '@vinejs/vine'

export const PAGINA_PADRAO = 1
export const LIMITE_PADRAO = 10

export function paginacao() {
  return {
    page: vine.number().withoutDecimals().min(1).optional(),
    limit: vine.number().withoutDecimals().min(1).max(100).optional(),
  }
}
