import type Estoque from '#models/estoque'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class SaldoEstoqueTransformer extends BaseTransformer<Estoque> {
  toObject() {
    const { produto, quantidade, quantidadeMinima, abaixoDoMinimo } = this.resource

    return {
      produtoId: produto.id,
      codigo: produto.codigo,
      nome: produto.nome,
      categoria: produto.categoria,
      quantidade,
      quantidadeMinima,
      abaixoDoMinimo,
    }
  }
}
