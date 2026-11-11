import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

import AnonimizacaoService from '#services/anonimizacao_service'
import { anonimizarContaValidator } from '#validators/user'

@inject()
export default class ClienteContaController {
  constructor(private anonimizacao: AnonimizacaoService) {}

  async destroy({ auth, request, response }: HttpContext) {
    const { password } = await request.validateUsing(anonimizarContaValidator)
    await this.anonimizacao.executar(auth.getUserOrFail(), password)

    return response.noContent()
  }
}
