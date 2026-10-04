import { createHmac, randomUUID } from 'node:crypto'
import { setTimeout as esperar } from 'node:timers/promises'

import type { Pagamento } from './pagamentos.ts'

export type EventoDePagamento = {
  id: string
  tipo: 'pagamento.aprovado' | 'pagamento.recusado'
  criadoEm: string
  pagamento: Pagamento
}

export type Entregador = {
  entregar(evento: EventoDePagamento): Promise<void>
}

export type OpcoesDeEntrega = {
  url: string
  segredo: string
  entregas: number
  tentativas: number
  intervaloBaseMs: number
  timeoutMs: number
}

export function eventoDo(pagamento: Pagamento): EventoDePagamento {
  return {
    id: `evt_${randomUUID()}`,
    tipo: pagamento.status === 'APROVADO' ? 'pagamento.aprovado' : 'pagamento.recusado',
    criadoEm: new Date().toISOString(),
    pagamento: { ...pagamento },
  }
}

export function assinar(segredo: string, timestamp: number, corpo: string) {
  return createHmac('sha256', segredo).update(`${timestamp}.${corpo}`).digest('hex')
}

export function cabecalhoDeAssinatura(segredo: string, timestamp: number, corpo: string) {
  return `t=${timestamp},v1=${assinar(segredo, timestamp, corpo)}`
}

export class EntregadorDeWebhook implements Entregador {
  #opcoes: OpcoesDeEntrega

  constructor(opcoes: OpcoesDeEntrega) {
    this.#opcoes = opcoes
  }

  async entregar(evento: EventoDePagamento) {
    const corpo = JSON.stringify(evento)

    for (let entrega = 0; entrega < this.#opcoes.entregas; entrega++) {
      await this.#entregarComRetentativas(evento.id, corpo)
    }
  }

  async #entregarComRetentativas(eventoId: string, corpo: string) {
    for (let tentativa = 1; ; tentativa++) {
      try {
        return await this.#enviar(eventoId, corpo)
      } catch (erro) {
        if (tentativa >= this.#opcoes.tentativas) {
          throw erro
        }

        await esperar(this.#opcoes.intervaloBaseMs * 2 ** (tentativa - 1))
      }
    }
  }

  async #enviar(eventoId: string, corpo: string) {
    const timestamp = Math.floor(Date.now() / 1000)

    const resposta = await fetch(this.#opcoes.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-evento-id': eventoId,
        'x-assinatura': cabecalhoDeAssinatura(this.#opcoes.segredo, timestamp, corpo),
      },
      body: corpo,
      signal: AbortSignal.timeout(this.#opcoes.timeoutMs),
    })

    if (!resposta.ok) {
      throw new Error(`Webhook ${eventoId} recusado com status ${resposta.status}`)
    }
  }
}
