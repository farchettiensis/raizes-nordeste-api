import type { ItemDoCardapio } from '#services/cardapio_service'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class ItemCardapioTransformer extends BaseTransformer<ItemDoCardapio> {
  toObject() {
    const { produto, preco, disponivel } = this.resource

    return {
      produtoId: produto.id,
      codigo: produto.codigo,
      nome: produto.nome,
      descricao: produto.descricao,
      categoria: produto.categoria,
      sazonal: produto.sazonal,
      preco,
      disponivel,
    }
  }
}
