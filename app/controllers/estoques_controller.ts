import type { HttpContext } from '@adonisjs/core/http'

import Estoque from '#models/estoque'
import Unidade from '#models/unidade'
import SaldoEstoqueTransformer from '#transformers/saldo_estoque_transformer'
import { listarEstoqueValidator } from '#validators/unidade'

const PAGINA_PADRAO = 1
const LIMITE_PADRAO = 10

export default class EstoquesController {
  async index({ params, request, serialize }: HttpContext) {
    const filtros = await listarEstoqueValidator.validate(request.qs())
    const unidade = await Unidade.findOrFail(params.id)

    const saldos = await Estoque.query()
      .select('estoques.*')
      .where('estoques.unidade_id', unidade.id)
      .join('produtos', 'produtos.id', 'estoques.produto_id')
      .orderBy('produtos.nome')
      .preload('produto')
      .paginate(filtros.page ?? PAGINA_PADRAO, filtros.limit ?? LIMITE_PADRAO)

    return serialize(SaldoEstoqueTransformer.paginate(saldos.all(), saldos.getMeta()))
  }
}
