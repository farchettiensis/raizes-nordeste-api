import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'

import Estoque from '#models/estoque'
import Unidade from '#models/unidade'
import { garantirAcessoAUnidade } from '#services/escopo_de_acesso'
import SaldoEstoqueTransformer from '#transformers/saldo_estoque_transformer'
import MovimentacaoEstoqueService from '#services/movimentacao_estoque_service'
import MovimentacaoEstoqueTransformer from '#transformers/movimentacao_estoque_transformer'
import { registrarMovimentacaoEstoqueValidator } from '#validators/movimentacao_estoque'
import { LIMITE_PADRAO, PAGINA_PADRAO } from '#validators/paginacao'
import { identificarUnidadeEstoqueValidator, listarEstoqueValidator } from '#validators/unidade'

@inject()
export default class EstoquesController {
  constructor(private movimentacoes: MovimentacaoEstoqueService) {}

  async store({ auth, params, request, response, serialize }: HttpContext) {
    const usuario = auth.getUserOrFail()
    const { id } = await identificarUnidadeEstoqueValidator.validate(params)
    const unidade = await Unidade.findOrFail(id)
    garantirAcessoAUnidade(usuario, unidade.id)
    const dados = await request.validateUsing(registrarMovimentacaoEstoqueValidator)
    const movimento = await this.movimentacoes.registrar(unidade.id, usuario, dados)

    response.status(201)
    return serialize(MovimentacaoEstoqueTransformer.transform(movimento))
  }

  async index({ auth, params, request, serialize }: HttpContext) {
    const filtros = await listarEstoqueValidator.validate(request.qs())
    const { id } = await identificarUnidadeEstoqueValidator.validate(params)
    const unidade = await Unidade.findOrFail(id)
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
