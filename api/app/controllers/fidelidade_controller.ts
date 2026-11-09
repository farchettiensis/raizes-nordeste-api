import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

import FidelidadeService from '#services/fidelidade_service'
import FidelidadeTransformer from '#transformers/fidelidade_transformer'

@inject()
export default class FidelidadeController {
  constructor(private fidelidade: FidelidadeService) {}

  async show({ auth, serialize }: HttpContext) {
    const programa = await this.fidelidade.programaDo(auth.getUserOrFail())

    return serialize(FidelidadeTransformer.transform(programa))
  }
}
