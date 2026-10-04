import { setTimeout as esperar } from 'node:timers/promises'
import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'

import Pagamento from '#models/pagamento'
import Pedido from '#models/pedido'
import type Unidade from '#models/unidade'
import type User from '#models/user'
import { GatewayPagamento } from '#services/gateway_pagamento'
import PedidoService from '#services/pedido_service'
import GatewayFalso from '#tests/helpers/gateway_falso'
import {
  criarCardapio,
  criarEstoque,
  criarProduto,
  criarUnidade,
  criarUsuario,
} from '#tests/helpers/fixtures'

type PagamentoRespondido = {
  data: {
    pagamentoId: number
    pedidoId: number
    status: string
    metodo: string
    valor: string
    referenciaExterna: string | null
    motivoRecusa: string | null
    pix: { copiaECola: string } | null
    processadoEm: string | null
    createdAt: string
  }
}

type ErrorBody = {
  error: string
  message: string
  details: { field: string; issue: string }[]
}

function pagamentoRespondido(response: { body(): unknown }) {
  return response.body() as PagamentoRespondido
}

function errorBody(response: { body(): unknown }) {
  return response.body() as ErrorBody
}

async function pedidoDe(cliente: User, unidade?: Unidade): Promise<Pedido> {
  const loja = unidade ?? (await criarUnidade())
  const produto = await criarProduto()
  await criarCardapio(loja, produto, '25.90')
  await criarEstoque(loja, produto, 10)

  return new PedidoService().criar(cliente, {
    unidadeId: loja.id,
    canalPedido: 'APP',
    itens: [{ produtoId: produto.id, quantidade: 2 }],
  })
}

const gateway = new GatewayFalso()

test.group('Solicitacao de pagamento', (group) => {
  group.setup(() => {
    app.container.swap(GatewayPagamento, () => gateway)

    return () => app.container.restore(GatewayPagamento)
  })

  group.each.setup(async () => {
    gateway.reiniciar()
    await testUtils.db().truncate()
  })

  test('sem token responde 401', async ({ client, assert }) => {
    const pedido = await pedidoDe(await criarUsuario('CLIENTE'))

    const response = await client
      .post(`/api/v1/pedidos/${pedido.id}/pagamento`)
      .json({ metodo: 'PIX' })

    response.assertStatus(401)
    assert.equal(errorBody(response).error, 'NAO_AUTENTICADO')
  })

  test('um perfil da operacao nao paga pedido', async ({ client, assert }) => {
    const pedido = await pedidoDe(await criarUsuario('CLIENTE'))
    const gerente = await criarUsuario('GERENTE')

    const response = await client
      .post(`/api/v1/pedidos/${pedido.id}/pagamento`)
      .json({ metodo: 'PIX' })
      .loginAs(gerente)

    response.assertStatus(403)
    assert.equal(errorBody(response).error, 'SEM_PERMISSAO')
  })

  test('o cliente nao paga o pedido de outro cliente', async ({ client, assert }) => {
    const pedido = await pedidoDe(await criarUsuario('CLIENTE'))
    const outro = await criarUsuario('CLIENTE')

    const response = await client
      .post(`/api/v1/pedidos/${pedido.id}/pagamento`)
      .json({ metodo: 'PIX' })
      .loginAs(outro)

    response.assertStatus(403)
    assert.equal(errorBody(response).message, 'Este pedido pertence a outro cliente.')
    assert.lengthOf(gateway.chamadas, 0)
    assert.isNull(await Pagamento.findBy('pedidoId', pedido.id))
  })

  test('pedido inexistente responde 404', async ({ client, assert }) => {
    const cliente = await criarUsuario('CLIENTE')

    const response = await client
      .post('/api/v1/pedidos/999999/pagamento')
      .json({ metodo: 'PIX' })
      .loginAs(cliente)

    response.assertStatus(404)
    assert.equal(errorBody(response).error, 'PEDIDO_NAO_ENCONTRADO')
  })

  test('id que nao e numero nao casa com a rota', async ({ client, assert }) => {
    const cliente = await criarUsuario('CLIENTE')

    const response = await client
      .post('/api/v1/pedidos/abc/pagamento')
      .json({ metodo: 'PIX' })
      .loginAs(cliente)

    response.assertStatus(404)
    assert.equal(errorBody(response).error, 'ROTA_NAO_ENCONTRADA')
  })

  test('metodo ausente ou fora da lista responde 422', async ({ client, assert }) => {
    const cliente = await criarUsuario('CLIENTE')
    const pedido = await pedidoDe(cliente)

    for (const corpo of [{}, { metodo: 'DINHEIRO' }, { metodo: 'BOLETO' }]) {
      const response = await client
        .post(`/api/v1/pedidos/${pedido.id}/pagamento`)
        .json(corpo as never)
        .loginAs(cliente)

      response.assertStatus(422)
      assert.equal(errorBody(response).details[0].field, 'metodo')
    }

    assert.lengthOf(gateway.chamadas, 0)
  })

  test('solicita ao provedor e registra o envio e o retorno', async ({ client, assert }) => {
    const cliente = await criarUsuario('CLIENTE')
    const pedido = await pedidoDe(cliente)

    const response = await client
      .post(`/api/v1/pedidos/${pedido.id}/pagamento`)
      .json({ metodo: 'PIX' })
      .loginAs(cliente)

    response.assertStatus(202)
    const { data } = pagamentoRespondido(response)
    assert.containsSubset(data, {
      pedidoId: pedido.id,
      status: 'PENDENTE',
      metodo: 'PIX',
      valor: '51.80',
      referenciaExterna: `pag_${data.pagamentoId}`,
      motivoRecusa: null,
      pix: { copiaECola: `PIX-MOCK-${data.pagamentoId}` },
      processadoEm: null,
    })

    assert.deepEqual(gateway.chamadas, [
      {
        chave: `pagamento-${data.pagamentoId}`,
        solicitacao: {
          referencia: String(data.pagamentoId),
          valorEmCentavos: 5180,
          metodo: 'PIX',
          descricao: `Pedido ${pedido.codigo}`,
        },
      },
    ])

    const salvo = await Pagamento.findOrFail(data.pagamentoId)
    assert.deepEqual(salvo.payloadRequisicao, {
      referencia: String(data.pagamentoId),
      valor: 5180,
      metodo: 'PIX',
      descricao: `Pedido ${pedido.codigo}`,
    })
    assert.equal(salvo.payloadResposta.id, `pag_${data.pagamentoId}`)
    assert.isNull(salvo.processadoEm)

    await pedido.refresh()
    assert.equal(pedido.status, 'AGUARDANDO_PAGAMENTO')
  })

  test('cartao nao traz codigo PIX', async ({ client, assert }) => {
    const cliente = await criarUsuario('CLIENTE')
    const pedido = await pedidoDe(cliente)

    const response = await client
      .post(`/api/v1/pedidos/${pedido.id}/pagamento`)
      .json({ metodo: 'CARTAO_CREDITO' })
      .loginAs(cliente)

    response.assertStatus(202)
    assert.isNull(pagamentoRespondido(response).data.pix)
  })

  test('repetir a solicitacao devolve o mesmo pagamento sem chamar o provedor de novo', async ({
    client,
    assert,
  }) => {
    const cliente = await criarUsuario('CLIENTE')
    const pedido = await pedidoDe(cliente)
    const pagar = () =>
      client.post(`/api/v1/pedidos/${pedido.id}/pagamento`).json({ metodo: 'PIX' }).loginAs(cliente)

    const primeira = await pagar()
    const repetida = await pagar()

    repetida.assertStatus(202)
    assert.deepEqual(pagamentoRespondido(repetida).data, pagamentoRespondido(primeira).data)
    assert.lengthOf(gateway.chamadas, 1)
    assert.lengthOf(await Pagamento.query().where('pedidoId', pedido.id), 1)
  })

  test('solicitacoes simultaneas esperam a trava do pedido e geram um unico pagamento', async ({
    client,
    assert,
  }) => {
    const cliente = await criarUsuario('CLIENTE')
    const pedido = await pedidoDe(cliente)
    const pagar = () =>
      client.post(`/api/v1/pedidos/${pedido.id}/pagamento`).json({ metodo: 'PIX' }).loginAs(cliente)

    const trava = await db.transaction()
    await Pedido.query({ client: trava }).where('id', pedido.id).forUpdate().firstOrFail()

    const emAndamento = Promise.all([pagar(), pagar()])
    await esperar(300)
    assert.lengthOf(await Pagamento.query().where('pedidoId', pedido.id), 0)

    await trava.commit()
    const respostas = await emAndamento

    respostas.forEach((response) => response.assertStatus(202))
    const pagamentos = await Pagamento.query().where('pedidoId', pedido.id)
    assert.lengthOf(pagamentos, 1)
    assert.deepEqual(
      respostas.map((response) => pagamentoRespondido(response).data.pagamentoId),
      [pagamentos[0].id, pagamentos[0].id]
    )
    assert.isTrue(
      gateway.chamadas.every((chamada) => chamada.chave === `pagamento-${pagamentos[0].id}`)
    )
  })

  test('trocar o metodo com pagamento em andamento responde 409', async ({ client, assert }) => {
    const cliente = await criarUsuario('CLIENTE')
    const pedido = await pedidoDe(cliente)

    await client
      .post(`/api/v1/pedidos/${pedido.id}/pagamento`)
      .json({ metodo: 'PIX' })
      .loginAs(cliente)
    const response = await client
      .post(`/api/v1/pedidos/${pedido.id}/pagamento`)
      .json({ metodo: 'CARTAO_DEBITO' })
      .loginAs(cliente)

    response.assertStatus(409)
    assert.equal(errorBody(response).error, 'PAGAMENTO_EM_ANDAMENTO')
    assert.deepEqual(errorBody(response).details, [
      { field: 'metodo', issue: 'Pagamento em andamento com PIX' },
    ])
  })

  test('provedor fora do ar responde 503 e a nova tentativa reusa a mesma chave', async ({
    client,
    assert,
  }) => {
    const cliente = await criarUsuario('CLIENTE')
    const pedido = await pedidoDe(cliente)
    const pagar = () =>
      client.post(`/api/v1/pedidos/${pedido.id}/pagamento`).json({ metodo: 'PIX' }).loginAs(cliente)

    gateway.foraDoAr = true
    const falha = await pagar()

    falha.assertStatus(503)
    assert.equal(errorBody(falha).error, 'GATEWAY_PAGAMENTO_INDISPONIVEL')
    const pendente = await Pagamento.findByOrFail('pedidoId', pedido.id)
    assert.equal(pendente.status, 'PENDENTE')
    assert.isNull(pendente.referenciaExterna)

    gateway.foraDoAr = false
    const retentativa = await pagar()

    retentativa.assertStatus(202)
    assert.equal(pagamentoRespondido(retentativa).data.pagamentoId, pendente.id)
    assert.deepEqual(
      gateway.chamadas.map((chamada) => chamada.chave),
      [`pagamento-${pendente.id}`, `pagamento-${pendente.id}`]
    )
  })

  for (const status of ['PAGO', 'CANCELADO'] as const) {
    test(`pedido ${status} responde 409`, async ({ client, assert }) => {
      const cliente = await criarUsuario('CLIENTE')
      const pedido = await pedidoDe(cliente)
      pedido.status = status
      await pedido.save()

      const response = await client
        .post(`/api/v1/pedidos/${pedido.id}/pagamento`)
        .json({ metodo: 'PIX' })
        .loginAs(cliente)

      response.assertStatus(409)
      assert.equal(errorBody(response).error, 'PEDIDO_NAO_AGUARDA_PAGAMENTO')
      assert.deepEqual(errorBody(response).details, [
        { field: 'status', issue: `Status atual: ${status}` },
      ])
      assert.lengthOf(gateway.chamadas, 0)
    })
  }
})
