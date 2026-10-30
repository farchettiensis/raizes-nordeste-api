import User from '#models/user'
import { registrarAuditoria } from '#services/auditoria'
import { signupValidator } from '#validators/user'
import type { HttpContext } from '@adonisjs/core/http'
import UserTransformer from '#transformers/user_transformer'

export default class NewAccountController {
  async store({ request, response, serialize }: HttpContext) {
    const { fullName, email, password } = await request.validateUsing(signupValidator)

    const user = await User.create({ fullName, email, password, perfil: 'CLIENTE' })
    const token = await User.accessTokens.create(user)

    await registrarAuditoria({
      acao: 'usuario.cadastrado',
      entidade: 'user',
      entidadeId: user.id,
      usuario: user,
      dados: { perfil: user.perfil },
    })

    response.status(201)

    return serialize({
      user: UserTransformer.transform(user),
      token: token.value!.release(),
    })
  }
}
