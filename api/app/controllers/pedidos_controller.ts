import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

import PedidoService from '#services/pedido_service'
import PedidoTransformer from '#transformers/pedido_transformer'
import { LIMITE_PADRAO, PAGINA_PADRAO } from '#validators/paginacao'
import { criarPedidoValidator, listarPedidosValidator } from '#validators/pedido'

@inject()
export default class PedidosController {
  constructor(private pedidos: PedidoService) {}

  async index({ auth, request, serialize }: HttpContext) {
    const filtros = await listarPedidosValidator.validate(request.qs())
    const pedidos = await this.pedidos.listarPara(auth.getUserOrFail(), {
      ...filtros,
      page: filtros.page ?? PAGINA_PADRAO,
      limit: filtros.limit ?? LIMITE_PADRAO,
    })

    return serialize(PedidoTransformer.paginate(pedidos.all(), pedidos.getMeta()))
  }

  async store({ auth, request, response, serialize }: HttpContext) {
    const dados = await request.validateUsing(criarPedidoValidator)
    const pedido = await this.pedidos.criar(auth.getUserOrFail(), dados)

    response.status(201)

    return serialize(PedidoTransformer.transform(pedido))
  }

  async show({ auth, params, serialize }: HttpContext) {
    const pedido = await this.pedidos.visivelPara(auth.getUserOrFail(), params.id)

    return serialize(PedidoTransformer.transform(pedido))
  }
}
