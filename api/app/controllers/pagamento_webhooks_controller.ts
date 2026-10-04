import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

import PagamentoService from '#services/pagamento_service'
import { eventoDePagamentoValidator } from '#validators/pagamento'

@inject()
export default class PagamentoWebhooksController {
  constructor(private pagamentos: PagamentoService) {}

  async store({ request, response }: HttpContext) {
    const evento = await request.validateUsing(eventoDePagamentoValidator)

    await this.pagamentos.processarResultado(evento, request.body())

    return response.noContent()
  }
}
