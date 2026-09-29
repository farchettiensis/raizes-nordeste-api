import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

import PedidoService from '#services/pedido_service'
import PedidoTransformer from '#transformers/pedido_transformer'
import { criarPedidoValidator } from '#validators/pedido'

@inject()
export default class PedidosController {
  constructor(private pedidos: PedidoService) {}

  async store({ auth, request, response, serialize }: HttpContext) {
    const dados = await request.validateUsing(criarPedidoValidator)
    const pedido = await this.pedidos.criar(auth.getUserOrFail(), dados)

    response.status(201)

    return serialize(PedidoTransformer.transform(pedido))
  }
}
