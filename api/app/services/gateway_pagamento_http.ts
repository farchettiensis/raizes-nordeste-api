import { setTimeout as esperar } from 'node:timers/promises'
import logger from '@adonisjs/core/services/logger'
import vine from '@vinejs/vine'

import ApiException from '#exceptions/api_exception'
import { METODOS_PAGAMENTO_EXTERNO } from '#models/pagamento'
import {
  GatewayPagamento,
  type PagamentoNoGateway,
  type RespostaDoGateway,
  type SolicitacaoAoGateway,
} from '#services/gateway_pagamento'

const pagamentoNoGatewayValidator = vine.create({
  id: vine.string().minLength(1),
  referencia: vine.string().minLength(1),
  valor: vine.number().withoutDecimals().positive(),
  metodo: vine.enum(METODOS_PAGAMENTO_EXTERNO),
  status: vine.enum(['PENDENTE', 'APROVADO', 'RECUSADO'] as const),
  motivoRecusa: vine.string().nullable(),
  pix: vine.object({ copiaECola: vine.string() }).nullable(),
  processadoEm: vine.string().nullable(),
})

export type OpcoesDoGatewayHttp = {
  url: string
  timeoutMs: number
  tentativas: number
  intervaloBaseMs: number
}

class FalhaTransitoria extends Error {}

function indisponivel() {
  return new ApiException('O provedor de pagamento nao respondeu. Tente novamente.', {
    code: 'GATEWAY_PAGAMENTO_INDISPONIVEL',
    status: 503,
  })
}

function respostaInesperada(motivo: string) {
  logger.error({ motivo }, 'Resposta inesperada do provedor de pagamento')

  return new ApiException('O provedor de pagamento devolveu uma resposta inesperada.', {
    code: 'GATEWAY_PAGAMENTO_ERRO',
    status: 502,
  })
}

export default class GatewayPagamentoHttp extends GatewayPagamento {
  #opcoes: OpcoesDoGatewayHttp

  constructor(opcoes: OpcoesDoGatewayHttp) {
    super()
    this.#opcoes = opcoes
  }

  async solicitar(
    chaveIdempotencia: string,
    solicitacao: SolicitacaoAoGateway
  ): Promise<RespostaDoGateway> {
    const requisicao = {
      referencia: solicitacao.referencia,
      valor: solicitacao.valorEmCentavos,
      metodo: solicitacao.metodo,
      descricao: solicitacao.descricao,
    }

    const resposta = await this.#comRetentativas(() =>
      this.#enviar('/pagamentos', chaveIdempotencia, requisicao)
    )

    try {
      const pagamento: PagamentoNoGateway = await pagamentoNoGatewayValidator.validate(resposta)

      return { requisicao, resposta, pagamento }
    } catch {
      throw respostaInesperada('corpo fora do contrato')
    }
  }

  async #comRetentativas<T>(operacao: () => Promise<T>): Promise<T> {
    for (let tentativa = 1; ; tentativa++) {
      try {
        return await operacao()
      } catch (erro) {
        if (!(erro instanceof FalhaTransitoria)) {
          throw erro
        }

        logger.warn({ tentativa, motivo: erro.message }, 'Provedor de pagamento falhou')

        if (tentativa >= this.#opcoes.tentativas) {
          throw indisponivel()
        }

        await esperar(this.#opcoes.intervaloBaseMs * 2 ** (tentativa - 1))
      }
    }
  }

  async #enviar(caminho: string, chaveIdempotencia: string, corpo: Record<string, unknown>) {
    let resposta: Response

    try {
      resposta = await fetch(new URL(caminho, this.#opcoes.url), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json',
          'idempotency-key': chaveIdempotencia,
        },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(this.#opcoes.timeoutMs),
      })
    } catch (erro) {
      throw new FalhaTransitoria(erro instanceof Error ? erro.message : String(erro))
    }

    if (resposta.status >= 500) {
      throw new FalhaTransitoria(`status ${resposta.status}`)
    }

    if (!resposta.ok) {
      throw respostaInesperada(`status ${resposta.status}: ${await resposta.text()}`)
    }

    try {
      return (await resposta.json()) as Record<string, unknown>
    } catch {
      throw respostaInesperada('corpo que nao e JSON')
    }
  }
}
