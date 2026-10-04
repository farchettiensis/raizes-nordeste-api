import assert from 'node:assert/strict'
import { createServer, type IncomingHttpHeaders } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, describe, test } from 'node:test'

import type { Pagamento } from '../src/pagamentos.ts'
import { assinar, EntregadorDeWebhook, eventoDo } from '../src/webhook.ts'

type Recebido = {
  cabecalhos: IncomingHttpHeaders
  corpo: string
}

const SEGREDO = 'segredo-de-teste'

const PAGAMENTO: Pagamento = {
  id: 'pag_1',
  referencia: 'pagamento-1',
  valor: 2590,
  metodo: 'PIX',
  descricao: null,
  status: 'APROVADO',
  motivoRecusa: null,
  pix: null,
  criadoEm: '2026-10-04T12:00:00.000Z',
  processadoEm: '2026-10-04T12:01:00.000Z',
}

describe('EntregadorDeWebhook', () => {
  const recebidos: Recebido[] = []
  let respostas: number[] = []
  let url = ''

  const servidor = createServer((request, response) => {
    let corpo = ''
    request.on('data', (parte) => (corpo += parte))
    request.on('end', () => {
      recebidos.push({ cabecalhos: request.headers, corpo })
      response.statusCode = respostas.shift() ?? 200
      response.end()
    })
  })

  before(async () => {
    await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/webhook`
  })

  after(() => servidor.close())

  beforeEach(() => {
    recebidos.length = 0
    respostas = []
  })

  function entregador({ entregas = 1, tentativas = 3 } = {}) {
    return new EntregadorDeWebhook({
      url,
      segredo: SEGREDO,
      entregas,
      tentativas,
      intervaloBaseMs: 1,
      timeoutMs: 1000,
    })
  }

  test('assina o corpo com o timestamp', async () => {
    const evento = eventoDo(PAGAMENTO)

    await entregador().entregar(evento)

    const [{ cabecalhos, corpo }] = recebidos
    const assinatura = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(String(cabecalhos['x-assinatura']))
    assert.ok(assinatura)
    assert.equal(assinatura[2], assinar(SEGREDO, Number(assinatura[1]), corpo))
    assert.equal(cabecalhos['x-evento-id'], evento.id)
    assert.deepEqual(JSON.parse(corpo), evento)
  })

  test('entrega o mesmo evento mais de uma vez quando configurado', async () => {
    const evento = eventoDo(PAGAMENTO)

    await entregador({ entregas: 2 }).entregar(evento)

    assert.equal(recebidos.length, 2)
    assert.deepEqual(
      recebidos.map((recebido) => recebido.cabecalhos['x-evento-id']),
      [evento.id, evento.id]
    )
  })

  test('tenta de novo quando o destino falha', async () => {
    respostas = [500, 503]

    await entregador({ tentativas: 3 }).entregar(eventoDo(PAGAMENTO))

    assert.equal(recebidos.length, 3)
  })

  test('desiste depois do limite de tentativas', async () => {
    respostas = [500, 500]

    await assert.rejects(entregador({ tentativas: 2 }).entregar(eventoDo(PAGAMENTO)), /status 500/)
    assert.equal(recebidos.length, 2)
  })

  test('evento de recusa leva o tipo e o motivo', () => {
    const evento = eventoDo({
      ...PAGAMENTO,
      status: 'RECUSADO',
      motivoRecusa: 'Saldo insuficiente',
    })

    assert.equal(evento.tipo, 'pagamento.recusado')
    assert.equal(evento.pagamento.motivoRecusa, 'Saldo insuficiente')
  })
})
