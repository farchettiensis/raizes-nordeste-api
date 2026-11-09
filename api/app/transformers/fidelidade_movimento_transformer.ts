import { BaseTransformer } from '@adonisjs/core/transformers'

import type FidelidadeMovimento from '#models/fidelidade_movimento'

export default class FidelidadeMovimentoTransformer extends BaseTransformer<FidelidadeMovimento> {
  toObject() {
    const { id, tipo, pontos, saldoResultante, pedidoId, descricao, createdAt } = this.resource

    return {
      movimentoId: id,
      tipo,
      pontos,
      saldoResultante,
      pedidoId: pedidoId ?? null,
      descricao: descricao ?? null,
      createdAt: createdAt.toISO(),
    }
  }
}
