import Estoque from '#models/estoque'
import type Produto from '#models/produto'
import UnidadeProduto from '#models/unidade_produto'

export type ItemDoCardapio = {
  produto: Produto
  preco: string
  disponivel: boolean
}

type Paginacao = {
  page: number
  limit: number
}

export default class CardapioService {
  async listarPorUnidade(unidadeId: number, { page, limit }: Paginacao) {
    const ofertas = await UnidadeProduto.query()
      .select('unidade_produtos.*')
      .where('unidade_produtos.unidade_id', unidadeId)
      .join('produtos', 'produtos.id', 'unidade_produtos.produto_id')
      .orderBy('produtos.nome')
      .preload('produto')
      .paginate(page, limit)

    const saldos = await this.saldosPorProduto(
      unidadeId,
      ofertas.all().map((oferta) => oferta.produtoId)
    )

    const itens: ItemDoCardapio[] = ofertas.all().map((oferta) => ({
      produto: oferta.produto,
      preco: oferta.preco,
      disponivel:
        oferta.disponivel && oferta.produto.ativo && (saldos.get(oferta.produtoId) ?? 0) > 0,
    }))

    return { itens, meta: ofertas.getMeta() }
  }

  private async saldosPorProduto(unidadeId: number, produtoIds: number[]) {
    if (produtoIds.length === 0) {
      return new Map<number, number>()
    }

    const estoques = await Estoque.query()
      .where('unidadeId', unidadeId)
      .whereIn('produtoId', produtoIds)

    return new Map(estoques.map((estoque) => [estoque.produtoId, estoque.quantidade]))
  }
}
