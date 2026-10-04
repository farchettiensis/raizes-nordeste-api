import type { MetodoPagamentoExterno } from '#models/pagamento'

export type PagamentoNoGateway = {
  id: string
  referencia: string
  valor: number
  metodo: MetodoPagamentoExterno
  status: 'PENDENTE' | 'APROVADO' | 'RECUSADO'
  motivoRecusa: string | null
  pix: { copiaECola: string } | null
  processadoEm: string | null
}

export type SolicitacaoAoGateway = {
  referencia: string
  valorEmCentavos: number
  metodo: MetodoPagamentoExterno
  descricao: string
}

export type RespostaDoGateway = {
  requisicao: Record<string, unknown>
  resposta: Record<string, unknown>
  pagamento: PagamentoNoGateway
}

export abstract class GatewayPagamento {
  abstract solicitar(
    chaveIdempotencia: string,
    solicitacao: SolicitacaoAoGateway
  ): Promise<RespostaDoGateway>
}
