import type { ApplicationService } from '@adonisjs/core/types'

import { GatewayPagamento } from '#services/gateway_pagamento'

export default class PagamentoProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton(GatewayPagamento, async () => {
      const { default: pagamentoConfig } = await import('#config/pagamento')
      const { default: GatewayPagamentoHttp } = await import('#services/gateway_pagamento_http')

      return new GatewayPagamentoHttp(pagamentoConfig.gateway)
    })
  }
}
