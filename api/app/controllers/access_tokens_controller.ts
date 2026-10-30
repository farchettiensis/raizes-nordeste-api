import User from '#models/user'
import { registrarAuditoria } from '#services/auditoria'
import { loginValidator } from '#validators/user'
import type { HttpContext } from '@adonisjs/core/http'
import { errors } from '@adonisjs/auth'
import UserTransformer from '#transformers/user_transformer'

export default class AccessTokensController {
  async store({ request, serialize }: HttpContext) {
    const { email, password } = await request.validateUsing(loginValidator)

    const user = await this.verificar(email, password)
    const token = await User.accessTokens.create(user)

    await registrarAuditoria({
      acao: 'auth.login',
      entidade: 'user',
      entidadeId: user.id,
      usuario: user,
    })

    return serialize({
      user: UserTransformer.transform(user),
      token: token.value!.release(),
    })
  }

  async destroy({ auth }: HttpContext) {
    const user = auth.getUserOrFail()
    if (user.currentAccessToken) {
      await User.accessTokens.delete(user, user.currentAccessToken.identifier)
    }

    await registrarAuditoria({
      acao: 'auth.logout',
      entidade: 'user',
      entidadeId: user.id,
      usuario: user,
    })

    return {
      message: 'Logged out successfully',
    }
  }

  private async verificar(email: string, password: string) {
    try {
      return await User.verifyCredentials(email, password)
    } catch (erro) {
      if (erro instanceof errors.E_INVALID_CREDENTIALS) {
        const alvo = await User.findBy('email', email)
        await registrarAuditoria({
          acao: 'auth.login_negado',
          entidade: 'user',
          entidadeId: alvo?.id,
        })
      }

      throw erro
    }
  }
}
