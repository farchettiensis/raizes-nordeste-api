import ApiException from '#exceptions/api_exception'
import {
  GatewayPagamento,
  type RespostaDoGateway,
  type SolicitacaoAoGateway,
} from '#services/gateway_pagamento'

export type Chamada = {
  chave: string
  solicitacao: SolicitacaoAoGateway
}

export default class GatewayFalso extends GatewayPagamento {
  chamadas: Chamada[] = []
  foraDoAr = false

  reiniciar() {
    this.chamadas = []
    this.foraDoAr = false
  }

  async solicitar(chave: string, solicitacao: SolicitacaoAoGateway): Promise<RespostaDoGateway> {
    this.chamadas.push({ chave, solicitacao })

    if (this.foraDoAr) {
      throw new ApiException('O provedor de pagamento nao respondeu. Tente novamente.', {
        code: 'GATEWAY_PAGAMENTO_INDISPONIVEL',
        status: 503,
      })
    }

    const pagamento = {
      id: `pag_${solicitacao.referencia}`,
      referencia: solicitacao.referencia,
      valor: solicitacao.valorEmCentavos,
      metodo: solicitacao.metodo,
      status: 'PENDENTE' as const,
      motivoRecusa: null,
      pix:
        solicitacao.metodo === 'PIX' ? { copiaECola: `PIX-MOCK-${solicitacao.referencia}` } : null,
      processadoEm: null,
    }

    return {
      requisicao: {
        referencia: solicitacao.referencia,
        valor: solicitacao.valorEmCentavos,
        metodo: solicitacao.metodo,
        descricao: solicitacao.descricao,
      },
      resposta: { ...pagamento, descricao: solicitacao.descricao },
      pagamento,
    }
  }
}
