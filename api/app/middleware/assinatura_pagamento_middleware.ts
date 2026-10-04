import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

import pagamentoConfig from '#config/pagamento'
import ApiException from '#exceptions/api_exception'
import { assinaturaValida } from '#services/assinatura_webhook'

export default class AssinaturaPagamentoMiddleware {
  async handle({ request }: HttpContext, next: NextFn) {
    const { segredo, toleranciaEmSegundos } = pagamentoConfig.webhook

    const valida = assinaturaValida(
      request.header('x-assinatura'),
      request.raw() ?? '',
      segredo.release(),
      { toleranciaEmSegundos }
    )

    if (!valida) {
      throw new ApiException('Assinatura do webhook ausente, invalida ou expirada.', {
        code: 'ASSINATURA_INVALIDA',
        status: 401,
      })
    }

    return next()
  }
}
