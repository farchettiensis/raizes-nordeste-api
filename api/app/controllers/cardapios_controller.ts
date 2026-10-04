import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

import Unidade from '#models/unidade'
import CardapioService from '#services/cardapio_service'
import ItemCardapioTransformer from '#transformers/item_cardapio_transformer'
import { listarCardapioValidator } from '#validators/unidade'

const PAGINA_PADRAO = 1
const LIMITE_PADRAO = 10

@inject()
export default class CardapiosController {
  constructor(private cardapio: CardapioService) {}

  async index({ params, request, serialize }: HttpContext) {
    const filtros = await listarCardapioValidator.validate(request.qs())
    const unidade = await Unidade.findOrFail(params.id)

    const { itens, meta } = await this.cardapio.listarPorUnidade(unidade.id, {
      page: filtros.page ?? PAGINA_PADRAO,
      limit: filtros.limit ?? LIMITE_PADRAO,
    })

    return serialize(ItemCardapioTransformer.paginate(itens, meta))
  }
}
