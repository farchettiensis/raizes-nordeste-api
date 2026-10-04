import { createServer, type IncomingHttpHeaders } from 'node:http'
import type { AddressInfo } from 'node:net'
import { test } from '@japa/runner'

import ApiException from '#exceptions/api_exception'
import GatewayPagamentoHttp from '#services/gateway_pagamento_http'
import type { SolicitacaoAoGateway } from '#services/gateway_pagamento'

type Recebido = {
  cabecalhos: IncomingHttpHeaders
  corpo: Record<string, unknown>
}

type RespostaRoteirizada = {
  status: number
  corpo?: unknown
}

const SOLICITACAO: SolicitacaoAoGateway = {
  referencia: '42',
  valorEmCentavos: 2590,
  metodo: 'PIX',
  descricao: 'Pedido PED1',
}

const PAGAMENTO_PENDENTE = {
  id: 'pag_1',
  referencia: '42',
  valor: 2590,
  metodo: 'PIX',
  descricao: 'Pedido PED1',
  status: 'PENDENTE',
  motivoRecusa: null,
  pix: { copiaECola: 'PIX-MOCK-1' },
  criadoEm: '2026-10-04T12:00:00.000Z',
  processadoEm: null,
}

test.group('GatewayPagamentoHttp', (group) => {
  const recebidos: Recebido[] = []
  let roteiro: RespostaRoteirizada[] = []
  let url = ''

  const servidor = createServer((request, response) => {
    let corpo = ''
    request.on('data', (parte) => (corpo += parte))
    request.on('end', () => {
      recebidos.push({ cabecalhos: request.headers, corpo: JSON.parse(corpo) })
      const proxima = roteiro.shift() ?? { status: 201, corpo: PAGAMENTO_PENDENTE }
      response.statusCode = proxima.status
      response.setHeader('content-type', 'application/json')
      response.end(
        typeof proxima.corpo === 'string' ? proxima.corpo : JSON.stringify(proxima.corpo)
      )
    })
  })

  group.setup(async () => {
    await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`

    return () => new Promise<void>((resolve) => servidor.close(() => resolve()))
  })

  group.each.setup(() => {
    recebidos.length = 0
    roteiro = []
  })

  function gateway(tentativas = 3) {
    return new GatewayPagamentoHttp({ url, timeoutMs: 1000, tentativas, intervaloBaseMs: 1 })
  }

  test('envia o valor em centavos com a chave de idempotencia', async ({ assert }) => {
    const { requisicao, pagamento } = await gateway().solicitar('pagamento-42', SOLICITACAO)

    assert.lengthOf(recebidos, 1)
    assert.equal(recebidos[0].cabecalhos['idempotency-key'], 'pagamento-42')
    assert.deepEqual(recebidos[0].corpo, {
      referencia: '42',
      valor: 2590,
      metodo: 'PIX',
      descricao: 'Pedido PED1',
    })
    assert.deepEqual(requisicao, recebidos[0].corpo)
    assert.equal(pagamento.id, 'pag_1')
    assert.equal(pagamento.pix?.copiaECola, 'PIX-MOCK-1')
  })

  test('tenta de novo com a mesma chave quando o provedor falha', async ({ assert }) => {
    roteiro = [
      { status: 503, corpo: {} },
      { status: 500, corpo: {} },
    ]

    const { pagamento } = await gateway(3).solicitar('pagamento-42', SOLICITACAO)

    assert.equal(pagamento.status, 'PENDENTE')
    assert.lengthOf(recebidos, 3)
    assert.deepEqual(
      recebidos.map((recebido) => recebido.cabecalhos['idempotency-key']),
      ['pagamento-42', 'pagamento-42', 'pagamento-42']
    )
  })

  test('desiste com 503 depois do limite de tentativas', async ({ assert }) => {
    roteiro = [
      { status: 503, corpo: {} },
      { status: 503, corpo: {} },
    ]

    const erro = await gateway(2)
      .solicitar('pagamento-42', SOLICITACAO)
      .catch((falha: unknown) => falha)

    assert.instanceOf(erro, ApiException)
    assert.equal((erro as ApiException).status, 503)
    assert.equal((erro as ApiException).code, 'GATEWAY_PAGAMENTO_INDISPONIVEL')
    assert.lengthOf(recebidos, 2)
  })

  test('provedor fora do ar responde 503', async ({ assert }) => {
    const foraDoAr = new GatewayPagamentoHttp({
      url: 'http://127.0.0.1:1',
      timeoutMs: 1000,
      tentativas: 2,
      intervaloBaseMs: 1,
    })

    const erro = await foraDoAr.solicitar('pagamento-42', SOLICITACAO).catch((falha) => falha)

    assert.equal((erro as ApiException).code, 'GATEWAY_PAGAMENTO_INDISPONIVEL')
  })

  test('erro do lado de quem chama nao e retentado e vira 502', async ({ assert }) => {
    roteiro = [{ status: 422, corpo: { erro: { codigo: 'REQUISICAO_INVALIDA' } } }]

    const erro = await gateway()
      .solicitar('pagamento-42', SOLICITACAO)
      .catch((falha) => falha)

    assert.equal((erro as ApiException).status, 502)
    assert.equal((erro as ApiException).code, 'GATEWAY_PAGAMENTO_ERRO')
    assert.lengthOf(recebidos, 1)
  })

  test('resposta fora do contrato vira 502', async ({ assert }) => {
    roteiro = [{ status: 201, corpo: { id: 'pag_1' } }]

    const erro = await gateway()
      .solicitar('pagamento-42', SOLICITACAO)
      .catch((falha) => falha)

    assert.equal((erro as ApiException).status, 502)
  })

  test('resposta que nao e JSON vira 502', async ({ assert }) => {
    roteiro = [{ status: 201, corpo: '<html>' }]

    const erro = await gateway()
      .solicitar('pagamento-42', SOLICITACAO)
      .catch((falha) => falha)

    assert.equal((erro as ApiException).status, 502)
  })
})
