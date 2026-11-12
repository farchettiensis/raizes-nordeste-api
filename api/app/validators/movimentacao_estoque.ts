import vine from '@vinejs/vine'

import { TIPOS_MOVIMENTACAO_ESTOQUE } from '#models/movimentacao_estoque'

const quantidadeMovimentada = vine.createRule((value, _, field) => {
  if (typeof value !== 'number') {
    return
  }

  if (value === 0 || (field.parent.tipo === 'ENTRADA' && value < 0)) {
    field.report(
      'Informe uma quantidade diferente de zero e positiva para entradas',
      'quantidadeMovimentada',
      field
    )
  }
})

export const registrarMovimentacaoEstoqueValidator = vine.create({
  produtoId: vine.number().withoutDecimals().positive().max(2147483647),
  tipo: vine.enum(TIPOS_MOVIMENTACAO_ESTOQUE.filter((tipo) => tipo !== 'SAIDA')),
  quantidade: vine
    .number()
    .withoutDecimals()
    .min(-2147483647)
    .max(2147483647)
    .use(quantidadeMovimentada()),
  motivo: vine.string().trim().minLength(3).maxLength(255),
})
