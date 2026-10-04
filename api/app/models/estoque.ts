import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { EstoqueSchema } from '#database/schema'
import MovimentacaoEstoque from '#models/movimentacao_estoque'
import Produto from '#models/produto'
import Unidade from '#models/unidade'

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

  get abaixoDoMinimo() {
    return this.quantidade <= this.quantidadeMinima
  }

  atende(quantidade: number) {
    return this.quantidade >= quantidade
  }
}
