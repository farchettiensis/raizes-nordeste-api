import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

import FidelidadeService from '#services/fidelidade_service'
import FidelidadeMovimentoTransformer from '#transformers/fidelidade_movimento_transformer'
import { listarMovimentosValidator } from '#validators/fidelidade'
import { LIMITE_PADRAO, PAGINA_PADRAO } from '#validators/paginacao'

@inject()
export default class FidelidadeMovimentosController {
  constructor(private fidelidade: FidelidadeService) {}

  async index({ auth, request, serialize }: HttpContext) {
    const filtros = await listarMovimentosValidator.validate(request.qs())
    const movimentos = await this.fidelidade.extratoDo(
      auth.getUserOrFail(),
      filtros.page ?? PAGINA_PADRAO,
      filtros.limit ?? LIMITE_PADRAO
    )

    return serialize(
      FidelidadeMovimentoTransformer.paginate(movimentos.all(), movimentos.getMeta())
    )
  }
}
