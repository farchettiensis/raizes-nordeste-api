import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { EstoqueSchema } from '#database/schema'
import MovimentacaoEstoque from '#models/movimentacao_estoque'
import type Pedido from '#models/pedido'
import PedidoItem from '#models/pedido_item'
import Produto from '#models/produto'
import Unidade from '#models/unidade'

export type Devolucao = {
  usuarioId: number | null
  motivo: string
}

export default class Estoque extends EstoqueSchema {
  static table = 'estoques'

  @belongsTo(() => Unidade)
  declare unidade: BelongsTo<typeof Unidade>

  @belongsTo(() => Produto)
  declare produto: BelongsTo<typeof Produto>

  @hasMany(() => MovimentacaoEstoque)
  declare movimentacoes: HasMany<typeof MovimentacaoEstoque>

  static travarDaUnidade(unidadeId: number, produtoIds: number[], trx: TransactionClientContract) {
    return this.query({ client: trx })
      .where('unidadeId', unidadeId)
      .whereIn('produtoId', produtoIds)
      .orderBy('produtoId')
      .forUpdate()
  }

  static async devolverItensDe(
    pedido: Pedido,
    { usuarioId, motivo }: Devolucao,
    trx: TransactionClientContract
  ) {
    const itens = await PedidoItem.query({ client: trx }).where('pedidoId', pedido.id)
    const estoques = await this.travarDaUnidade(
      pedido.unidadeId,
      itens.map((item) => item.produtoId),
      trx
    )
    const porProduto = new Map(estoques.map((estoque) => [estoque.produtoId, estoque]))

    for (const item of itens) {
      const estoque = porProduto.get(item.produtoId)!
      estoque.quantidade += item.quantidade
      await estoque.save()

      await MovimentacaoEstoque.create(
        {
          estoqueId: estoque.id,
          pedidoId: pedido.id,
          usuarioId,
          tipo: 'ENTRADA',
          quantidade: item.quantidade,
          saldoResultante: estoque.quantidade,
          motivo,
        },
        { client: trx }
      )
    }
  }

  get abaixoDoMinimo() {
    return this.quantidade <= this.quantidadeMinima
  }

  atende(quantidade: number) {
    return this.quantidade >= quantidade
  }
}
