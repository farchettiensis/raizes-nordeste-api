import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

import ApiException from '#exceptions/api_exception'
import type { PerfilUsuario } from '#models/user'

export default class PerfilMiddleware {
  async handle(ctx: HttpContext, next: NextFn, options: { perfis: PerfilUsuario[] }) {
    const usuario = ctx.auth.user ?? (await ctx.auth.authenticateUsing())

    if (!usuario.temPerfil(...options.perfis)) {
      throw new ApiException('Seu perfil nao tem permissao para esta acao.', {
        code: 'SEM_PERMISSAO',
        status: 403,
      })
    }

    return next()
  }
}
