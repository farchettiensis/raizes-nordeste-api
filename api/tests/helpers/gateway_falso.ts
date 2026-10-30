import ApiException from '#exceptions/api_exception'
import {
  GatewayPagamento,
  type RespostaDoEstorno,
  type RespostaDoGateway,
  type SolicitacaoAoGateway,
} from '#services/gateway_pagamento'

export type Chamada = {
  chave: string
  solicitacao: SolicitacaoAoGateway
}

export type Estorno = {
  chave: string
  referenciaExterna: string
}

function indisponivel() {
  return new ApiException('O provedor de pagamento nao respondeu. Tente novamente.', {
    code: 'GATEWAY_PAGAMENTO_INDISPONIVEL',
    status: 503,
  })
}

export default class GatewayFalso extends GatewayPagamento {
  chamadas: Chamada[] = []
  estornos: Estorno[] = []
  foraDoAr = false

  reiniciar() {
    this.chamadas = []
    this.estornos = []
    this.foraDoAr = false
  }

  async solicitar(chave: string, solicitacao: SolicitacaoAoGateway): Promise<RespostaDoGateway> {
    this.chamadas.push({ chave, solicitacao })

    if (this.foraDoAr) {
      throw indisponivel()
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

  async estornar(chave: string, referenciaExterna: string): Promise<RespostaDoEstorno> {
    this.estornos.push({ chave, referenciaExterna })

    if (this.foraDoAr) {
      throw indisponivel()
    }

    const estorno = {
      id: referenciaExterna,
      status: 'ESTORNADO' as const,
      estornadoEm: '2026-10-05T09:00:00.000Z',
    }

    return { resposta: { ...estorno, referencia: referenciaExterna }, estorno }
  }
}
