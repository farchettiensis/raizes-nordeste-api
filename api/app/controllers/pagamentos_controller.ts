import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

import PagamentoService from '#services/pagamento_service'
import PagamentoTransformer from '#transformers/pagamento_transformer'
import { solicitarPagamentoValidator } from '#validators/pagamento'

@inject()
export default class PagamentosController {
  constructor(private pagamentos: PagamentoService) {}

  async store({ auth, params, request, response, serialize }: HttpContext) {
    const { metodo } = await request.validateUsing(solicitarPagamentoValidator)
    const pagamento = await this.pagamentos.solicitar(auth.getUserOrFail(), params.id, metodo)

    response.status(202)

    return serialize(PagamentoTransformer.transform(pagamento))
  }
}
