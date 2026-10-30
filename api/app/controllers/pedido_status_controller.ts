import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

import CancelamentoService from '#services/cancelamento_service'
import PedidoService from '#services/pedido_service'
import PedidoTransformer from '#transformers/pedido_transformer'
import { atualizarStatusValidator } from '#validators/pedido'

@inject()
export default class PedidoStatusController {
  constructor(
    private pedidos: PedidoService,
    private cancelamentos: CancelamentoService
  ) {}

  async update({ auth, params, request, serialize }: HttpContext) {
    const { status, motivo } = await request.validateUsing(atualizarStatusValidator)
    const usuario = auth.getUserOrFail()
    const pedido =
      status === 'CANCELADO'
        ? await this.cancelamentos.cancelar(usuario, params.id, motivo!)
        : await this.pedidos.atualizarStatus(usuario, params.id, status)

    return serialize(PedidoTransformer.transform(pedido))
  }
}
