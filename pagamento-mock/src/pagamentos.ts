import { randomBytes, randomUUID } from 'node:crypto'

import { ErroDoProvedor } from './erros.ts'

export const METODOS = ['PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO'] as const

export type Metodo = (typeof METODOS)[number]

export const RESULTADOS = ['APROVADO', 'RECUSADO'] as const

export type Resultado = (typeof RESULTADOS)[number]

export type StatusPagamento = 'PENDENTE' | Resultado

export const MOTIVO_RECUSA_PADRAO = 'Pagamento recusado pelo emissor (simulado)'

export type SolicitacaoPagamento = {
  referencia: string
  valor: number
  metodo: Metodo
  descricao?: string
}

export type Pagamento = {
  id: string
  referencia: string
  valor: number
  metodo: Metodo
  descricao: string | null
  status: StatusPagamento
  motivoRecusa: string | null
  pix: { copiaECola: string } | null
  criadoEm: string
  processadoEm: string | null
}

export type Criacao = {
  pagamento: Pagamento
  repetida: boolean
}

function impressaoDa(solicitacao: SolicitacaoPagamento) {
  const { referencia, valor, metodo, descricao } = solicitacao

  return JSON.stringify([referencia, valor, metodo, descricao ?? null])
}

function cobrancaPix() {
  const txid = randomBytes(12).toString('hex').toUpperCase()

  return { copiaECola: `PIX-MOCK-${txid}` }
}

export class RegistroDePagamentos {
  #porId = new Map<string, Pagamento>()
  #porChave = new Map<string, { impressao: string; pagamentoId: string }>()

  criar(chaveIdempotencia: string, solicitacao: SolicitacaoPagamento): Criacao {
    const impressao = impressaoDa(solicitacao)
    const anterior = this.#porChave.get(chaveIdempotencia)

    if (anterior) {
      if (anterior.impressao !== impressao) {
        throw new ErroDoProvedor(
          409,
          'CHAVE_IDEMPOTENCIA_REUTILIZADA',
          'A chave de idempotencia ja foi usada com outro conteudo.'
        )
      }

      return { pagamento: this.buscar(anterior.pagamentoId), repetida: true }
    }

    const pagamento: Pagamento = {
      id: `pag_${randomUUID()}`,
      referencia: solicitacao.referencia,
      valor: solicitacao.valor,
      metodo: solicitacao.metodo,
      descricao: solicitacao.descricao ?? null,
      status: 'PENDENTE',
      motivoRecusa: null,
      pix: solicitacao.metodo === 'PIX' ? cobrancaPix() : null,
      criadoEm: new Date().toISOString(),
      processadoEm: null,
    }

    this.#porId.set(pagamento.id, pagamento)
    this.#porChave.set(chaveIdempotencia, { impressao, pagamentoId: pagamento.id })

    return { pagamento, repetida: false }
  }

  buscar(id: string): Pagamento {
    const pagamento = this.#porId.get(id)

    if (!pagamento) {
      throw new ErroDoProvedor(404, 'PAGAMENTO_NAO_ENCONTRADO', `Pagamento ${id} nao encontrado.`)
    }

    return pagamento
  }

  processar(id: string, resultado: Resultado, motivo?: string): Pagamento {
    const pagamento = this.buscar(id)

    if (pagamento.status !== 'PENDENTE') {
      throw new ErroDoProvedor(
        409,
        'PAGAMENTO_JA_PROCESSADO',
        `Pagamento ${id} ja foi processado como ${pagamento.status}.`
      )
    }

    pagamento.status = resultado
    pagamento.motivoRecusa = resultado === 'RECUSADO' ? (motivo ?? MOTIVO_RECUSA_PADRAO) : null
    pagamento.processadoEm = new Date().toISOString()

    return pagamento
  }
}
