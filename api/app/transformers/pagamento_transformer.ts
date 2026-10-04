import type Pagamento from '#models/pagamento'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class PagamentoTransformer extends BaseTransformer<Pagamento> {
  toObject() {
    const { id, pedidoId, status, metodo, valor, referenciaExterna, motivoRecusa } = this.resource

    return {
      pagamentoId: id,
      pedidoId,
      status,
      metodo,
      valor,
      referenciaExterna: referenciaExterna ?? null,
      motivoRecusa: motivoRecusa ?? null,
      pix: this.resource.pixCopiaECola ? { copiaECola: this.resource.pixCopiaECola } : null,
      processadoEm: this.resource.processadoEm?.toISO() ?? null,
      createdAt: this.resource.createdAt.toISO(),
    }
  }
}
