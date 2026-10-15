import type { HttpContext } from '@adonisjs/core/http'

import Estoque from '#models/estoque'
import Unidade from '#models/unidade'
import { garantirAcessoAUnidade } from '#services/escopo_de_acesso'
import SaldoEstoqueTransformer from '#transformers/saldo_estoque_transformer'
import { LIMITE_PADRAO, PAGINA_PADRAO } from '#validators/paginacao'
import { listarEstoqueValidator } from '#validators/unidade'

export default class EstoquesController {
  async index({ auth, params, request, serialize }: HttpContext) {
    const filtros = await listarEstoqueValidator.validate(request.qs())
    const unidade = await Unidade.findOrFail(params.id)
    garantirAcessoAUnidade(auth.getUserOrFail(), unidade.id)

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
