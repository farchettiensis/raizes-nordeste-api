import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

import PedidoService from '#services/pedido_service'
import PedidoTransformer from '#transformers/pedido_transformer'
import { atualizarStatusValidator } from '#validators/pedido'

@inject()
export default class PedidoStatusController {
  constructor(private pedidos: PedidoService) {}

  async update({ auth, params, request, serialize }: HttpContext) {
    const { status } = await request.validateUsing(atualizarStatusValidator)
    const pedido = await this.pedidos.atualizarStatus(auth.getUserOrFail(), params.id, status)

    return serialize(PedidoTransformer.transform(pedido))
  }
}
