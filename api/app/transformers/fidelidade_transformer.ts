import { BaseTransformer } from '@adonisjs/core/transformers'

import {
  LIMITE_DE_DESCONTO_PERCENTUAL,
  PONTOS_POR_REAL,
  VALOR_DO_PONTO_EM_CENTAVOS,
} from '#models/fidelidade_conta'
import { emReais } from '#services/centavos'
import type { ProgramaDoCliente } from '#services/fidelidade_service'

export default class FidelidadeTransformer extends BaseTransformer<ProgramaDoCliente> {
  toObject() {
    const { ativa, conta } = this.resource

    return {
      ativa,
      aderiuEm: ativa ? (conta?.aderiuEm.toISO() ?? null) : null,
      saldoPontos: ativa ? (conta?.saldoPontos ?? 0) : 0,
      regras: {
        pontosPorReal: PONTOS_POR_REAL,
        valorDoPonto: emReais(VALOR_DO_PONTO_EM_CENTAVOS),
        limiteDeDescontoPercentual: LIMITE_DE_DESCONTO_PERCENTUAL,
      },
    }
  }
}
