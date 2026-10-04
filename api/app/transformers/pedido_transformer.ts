import type Pedido from '#models/pedido'
import PagamentoTransformer from '#transformers/pagamento_transformer'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class PedidoTransformer extends BaseTransformer<Pedido> {
  toObject() {
    const { id, codigo, unidadeId, canalPedido, status, subtotal, desconto, total, createdAt } =
      this.resource

    return {
      pedidoId: id,
      codigo,
      unidadeId,
      canalPedido,
      status,
      subtotal,
      desconto,
      total,
      itens: this.resource.itens.map((item) => ({
        produtoId: item.produtoId,
        nome: item.nomeProduto,
        quantidade: item.quantidade,
        precoUnitario: item.precoUnitario,
        subtotal: item.subtotal,
      })),
      pagamento: PagamentoTransformer.transform(this.whenLoaded(this.resource.pagamento)),
      createdAt: createdAt.toISO(),
    }
  }
}
