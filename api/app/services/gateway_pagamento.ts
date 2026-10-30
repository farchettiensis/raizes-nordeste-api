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

export type EstornoNoGateway = {
  id: string
  status: 'ESTORNADO'
  estornadoEm: string
}

export type RespostaDoEstorno = {
  resposta: Record<string, unknown>
  estorno: EstornoNoGateway
}

export abstract class GatewayPagamento {
  abstract solicitar(
    chaveIdempotencia: string,
    solicitacao: SolicitacaoAoGateway
  ): Promise<RespostaDoGateway>

  abstract estornar(
    chaveIdempotencia: string,
    referenciaExterna: string
  ): Promise<RespostaDoEstorno>
}
