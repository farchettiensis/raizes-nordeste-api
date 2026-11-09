import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

import FidelidadeService from '#services/fidelidade_service'
import FidelidadeTransformer from '#transformers/fidelidade_transformer'
import { aderirFidelidadeValidator } from '#validators/fidelidade'

@inject()
export default class FidelidadeAdesoesController {
  constructor(private fidelidade: FidelidadeService) {}

  async store({ auth, request, response, serialize }: HttpContext) {
    await request.validateUsing(aderirFidelidadeValidator)
    const programa = await this.fidelidade.aderir(auth.getUserOrFail())

    response.status(201)

    return serialize(FidelidadeTransformer.transform(programa))
  }

  async destroy({ auth, response }: HttpContext) {
    await this.fidelidade.revogar(auth.getUserOrFail())

    return response.noContent()
  }
}
