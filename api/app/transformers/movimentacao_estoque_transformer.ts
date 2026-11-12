import { BaseTransformer } from '@adonisjs/core/transformers'

import type MovimentacaoEstoque from '#models/movimentacao_estoque'

export default class MovimentacaoEstoqueTransformer extends BaseTransformer<MovimentacaoEstoque> {
  toObject() {
    const { id, estoqueId, usuarioId, tipo, quantidade, saldoResultante, motivo, createdAt } =
      this.resource

    return {
      movimentoId: id,
      estoqueId,
      usuarioId,
      tipo,
      quantidade,
      saldoResultante,
      motivo,
      createdAt: createdAt.toISO(),
    }
  }
}
