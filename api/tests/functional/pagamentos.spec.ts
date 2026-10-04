import { setTimeout as esperar } from 'node:timers/promises'
import type { ApiClient } from '@japa/api-client'
import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'

import pagamentoConfig from '#config/pagamento'
import Estoque from '#models/estoque'
import MovimentacaoEstoque from '#models/movimentacao_estoque'
import Pagamento from '#models/pagamento'
import Pedido from '#models/pedido'
import type Produto from '#models/produto'
import type Unidade from '#models/unidade'
import type User from '#models/user'
import { assinar } from '#services/assinatura_webhook'
import { emCentavos } from '#services/centavos'
import { GatewayPagamento } from '#services/gateway_pagamento'
import PagamentoService from '#services/pagamento_service'
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

async function comPedidoTravado<T>(
  pedido: Pedido,
  disparar: () => Promise<T>,
  enquantoTravado: () => Promise<void>
) {
  const trava = await db.transaction()

  try {
    await Pedido.query({ client: trava }).where('id', pedido.id).forUpdate().firstOrFail()
    const emAndamento = disparar()
    await esperar(300)
    await enquantoTravado()
    await trava.commit()

    return await emAndamento
  } finally {
    if (!trava.isCompleted) {
      await trava.rollback()
    }
  }
}

const gateway = new GatewayFalso()

test.group('Solicitacao de pagamento', (group) => {
  group.setup(() => {
    app.container.swap(GatewayPagamento, () => gateway)

    return () => app.container.restore(GatewayPagamento)
  })

  group.each.setup(() => {
    gateway.reiniciar()

    return testUtils.db().truncate()
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

    const respostas = await comPedidoTravado(
      pedido,
      () => Promise.all([pagar(), pagar()]),
      async () => assert.lengthOf(await Pagamento.query().where('pedidoId', pedido.id), 0)
    )

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

type ResultadoDoProvedor = 'APROVADO' | 'RECUSADO'

const SEGREDO = pagamentoConfig.webhook.segredo.release()
const MOTIVO = 'Saldo insuficiente'

function agoraEmSegundos() {
  return Math.floor(Date.now() / 1000)
}

function eventoPara(
  pagamento: Pagamento,
  status: ResultadoDoProvedor,
  sobrescritas: Record<string, unknown> = {}
) {
  return {
    id: `evt_${pagamento.id}_${status}`,
    tipo: status === 'APROVADO' ? 'pagamento.aprovado' : 'pagamento.recusado',
    criadoEm: '2026-10-04T12:00:00.000Z',
    pagamento: {
      id: pagamento.referenciaExterna,
      referencia: String(pagamento.id),
      valor: emCentavos(pagamento.valor),
      metodo: pagamento.metodo,
      status,
      motivoRecusa: status === 'RECUSADO' ? MOTIVO : null,
      processadoEm: '2026-10-04T12:00:00.000Z',
      ...sobrescritas,
    },
  }
}

function enviarWebhook(
  client: ApiClient,
  evento: object,
  { segredo = SEGREDO, timestamp = agoraEmSegundos() } = {}
) {
  const corpo = JSON.stringify(evento)

  return client
    .post('/api/v1/pagamentos/webhook')
    .header('x-assinatura', `t=${timestamp},v1=${assinar(segredo, timestamp, corpo)}`)
    .unsafeJson(corpo)
}

async function pedidoComDoisItens(cliente: User) {
  const unidade = await criarUnidade()
  const [tapioca, cuscuz] = [await criarProduto(), await criarProduto()]
  await criarCardapio(unidade, tapioca, '18.90')
  await criarCardapio(unidade, cuscuz, '22.35')
  await criarEstoque(unidade, tapioca, 10)
  await criarEstoque(unidade, cuscuz, 5)

  const pedido = await new PedidoService().criar(cliente, {
    unidadeId: unidade.id,
    canalPedido: 'TOTEM',
    itens: [
      { produtoId: tapioca.id, quantidade: 3 },
      { produtoId: cuscuz.id, quantidade: 2 },
    ],
  })

  return { pedido, unidade, tapioca, cuscuz }
}

async function saldoDe(unidade: Unidade, produto: Produto) {
  const estoque = await Estoque.query()
    .where('unidadeId', unidade.id)
    .where('produtoId', produto.id)
    .firstOrFail()

  return estoque.quantidade
}

async function pagamentoPendente(cliente: User, pedido: Pedido) {
  return new PagamentoService(gateway).solicitar(cliente, pedido.id, 'PIX')
}

test.group('Webhook de pagamento', (group) => {
  group.setup(() => {
    app.container.swap(GatewayPagamento, () => gateway)

    return () => app.container.restore(GatewayPagamento)
  })

  group.each.setup(() => {
    gateway.reiniciar()

    return testUtils.db().truncate()
  })

  test('sem assinatura responde 401', async ({ client, assert }) => {
    const response = await client.post('/api/v1/pagamentos/webhook').json({} as never)

    response.assertStatus(401)
    assert.equal(errorBody(response).error, 'ASSINATURA_INVALIDA')
  })

  test('assinatura com outro segredo responde 401 e nao muda nada', async ({ client, assert }) => {
    const cliente = await criarUsuario('CLIENTE')
    const pedido = await pedidoDe(cliente)
    const pagamento = await pagamentoPendente(cliente, pedido)

    const response = await enviarWebhook(client, eventoPara(pagamento, 'APROVADO'), {
      segredo: 'outro-segredo',
    })

    response.assertStatus(401)
    await pedido.refresh()
    assert.equal(pedido.status, 'AGUARDANDO_PAGAMENTO')
  })

  test('assinatura expirada responde 401', async ({ client, assert }) => {
    const cliente = await criarUsuario('CLIENTE')
    const pagamento = await pagamentoPendente(cliente, await pedidoDe(cliente))

    const response = await enviarWebhook(client, eventoPara(pagamento, 'APROVADO'), {
      timestamp: agoraEmSegundos() - 301,
    })

    response.assertStatus(401)
    assert.equal(errorBody(response).error, 'ASSINATURA_INVALIDA')
  })

  test('corpo alterado depois de assinado responde 401', async ({ client }) => {
    const cliente = await criarUsuario('CLIENTE')
    const pagamento = await pagamentoPendente(cliente, await pedidoDe(cliente))
    const timestamp = agoraEmSegundos()
    const assinado = JSON.stringify(eventoPara(pagamento, 'RECUSADO'))
    const adulterado = JSON.stringify(eventoPara(pagamento, 'APROVADO'))

    const response = await client
      .post('/api/v1/pagamentos/webhook')
      .header('x-assinatura', `t=${timestamp},v1=${assinar(SEGREDO, timestamp, assinado)}`)
      .unsafeJson(adulterado)

    response.assertStatus(401)
  })

  test('evento fora do contrato responde 422', async ({ client, assert }) => {
    const response = await enviarWebhook(client, { id: 'evt_1', tipo: 'pagamento.talvez' })

    response.assertStatus(422)
    assert.includeMembers(
      errorBody(response).details.map((detalhe) => detalhe.field),
      ['tipo', 'pagamento']
    )
  })

  test('referencia desconhecida responde 404', async ({ client, assert }) => {
    const cliente = await criarUsuario('CLIENTE')
    const pagamento = await pagamentoPendente(cliente, await pedidoDe(cliente))

    const response = await enviarWebhook(
      client,
      eventoPara(pagamento, 'APROVADO', { referencia: '999999' })
    )

    response.assertStatus(404)
    assert.equal(errorBody(response).error, 'PAGAMENTO_NAO_ENCONTRADO')
  })

  test('aprovado leva o pedido a PAGO e registra o retorno', async ({ client, assert }) => {
    const cliente = await criarUsuario('CLIENTE')
    const pedido = await pedidoDe(cliente)
    const pagamento = await pagamentoPendente(cliente, pedido)
    const evento = eventoPara(pagamento, 'APROVADO')

    const response = await enviarWebhook(client, evento)

    response.assertStatus(204)
    await pedido.refresh()
    await pagamento.refresh()
    assert.equal(pedido.status, 'PAGO')
    assert.isNull(pedido.canceladoEm)
    assert.equal(pagamento.status, 'APROVADO')
    assert.isNull(pagamento.motivoRecusa)
    assert.equal(pagamento.processadoEm?.toUTC().toISO(), '2026-10-04T12:00:00.000Z')
    assert.deepEqual(pagamento.payloadWebhook, evento)
    assert.lengthOf(await MovimentacaoEstoque.query().where('tipo', 'ENTRADA'), 0)
  })

  test('recusado cancela o pedido e devolve o estoque com uma entrada por item', async ({
    client,
    assert,
  }) => {
    const cliente = await criarUsuario('CLIENTE')
    const { pedido, unidade, tapioca, cuscuz } = await pedidoComDoisItens(cliente)
    const pagamento = await pagamentoPendente(cliente, pedido)
    assert.equal(await saldoDe(unidade, tapioca), 7)
    assert.equal(await saldoDe(unidade, cuscuz), 3)

    const response = await enviarWebhook(client, eventoPara(pagamento, 'RECUSADO'))

    response.assertStatus(204)
    await pedido.refresh()
    await pagamento.refresh()
    assert.equal(pedido.status, 'CANCELADO')
    assert.isNotNull(pedido.canceladoEm)
    assert.equal(pagamento.status, 'RECUSADO')
    assert.equal(pagamento.motivoRecusa, MOTIVO)

    assert.equal(await saldoDe(unidade, tapioca), 10)
    assert.equal(await saldoDe(unidade, cuscuz), 5)
    const entradas = await MovimentacaoEstoque.query()
      .where('tipo', 'ENTRADA')
      .preload('estoque')
      .orderBy('id')
    assert.deepEqual(
      entradas.map((entrada) => ({
        produtoId: entrada.estoque.produtoId,
        pedidoId: entrada.pedidoId,
        quantidade: entrada.quantidade,
        saldoResultante: entrada.saldoResultante,
      })),
      [
        { produtoId: tapioca.id, pedidoId: pedido.id, quantidade: 3, saldoResultante: 10 },
        { produtoId: cuscuz.id, pedidoId: pedido.id, quantidade: 2, saldoResultante: 5 },
      ].sort((a, b) => a.produtoId - b.produtoId)
    )
  })

  test('entrega repetida e ignorada e nao devolve o estoque duas vezes', async ({
    client,
    assert,
  }) => {
    const cliente = await criarUsuario('CLIENTE')
    const { pedido, unidade, tapioca } = await pedidoComDoisItens(cliente)
    const pagamento = await pagamentoPendente(cliente, pedido)
    const evento = eventoPara(pagamento, 'RECUSADO')

    const primeira = await enviarWebhook(client, evento)
    const repetida = await enviarWebhook(client, evento)

    primeira.assertStatus(204)
    repetida.assertStatus(204)
    assert.equal(await saldoDe(unidade, tapioca), 10)
    assert.lengthOf(await MovimentacaoEstoque.query().where('tipo', 'ENTRADA'), 2)
  })

  test('resultado contrario depois do primeiro e ignorado', async ({ client, assert }) => {
    const cliente = await criarUsuario('CLIENTE')
    const pedido = await pedidoDe(cliente)
    const pagamento = await pagamentoPendente(cliente, pedido)

    await enviarWebhook(client, eventoPara(pagamento, 'RECUSADO'))
    const response = await enviarWebhook(client, eventoPara(pagamento, 'APROVADO'))

    response.assertStatus(204)
    await pedido.refresh()
    await pagamento.refresh()
    assert.equal(pedido.status, 'CANCELADO')
    assert.equal(pagamento.status, 'RECUSADO')
  })

  test('valor ou identificador divergentes respondem 409 sem mudar nada', async ({
    client,
    assert,
  }) => {
    const cliente = await criarUsuario('CLIENTE')
    const pedido = await pedidoDe(cliente)
    const pagamento = await pagamentoPendente(cliente, pedido)

    const response = await enviarWebhook(
      client,
      eventoPara(pagamento, 'APROVADO', { valor: 1, id: 'pag_de_outro' })
    )

    response.assertStatus(409)
    assert.equal(errorBody(response).error, 'PAGAMENTO_DIVERGENTE')
    assert.sameMembers(
      errorBody(response).details.map((detalhe) => detalhe.field),
      ['pagamento.valor', 'pagamento.id']
    )
    await pedido.refresh()
    assert.equal(pedido.status, 'AGUARDANDO_PAGAMENTO')
  })

  test('o resultado pode chegar antes de a referencia externa ser gravada', async ({
    client,
    assert,
  }) => {
    const cliente = await criarUsuario('CLIENTE')
    const pedido = await pedidoDe(cliente)
    gateway.foraDoAr = true
    await pagamentoPendente(cliente, pedido).catch(() => {})
    const pagamento = await Pagamento.findByOrFail('pedidoId', pedido.id)
    assert.isNull(pagamento.referenciaExterna)

    const response = await enviarWebhook(
      client,
      eventoPara(pagamento, 'APROVADO', { id: 'pag_do_provedor' })
    )

    response.assertStatus(204)
    await pagamento.refresh()
    assert.equal(pagamento.referenciaExterna, 'pag_do_provedor')
    assert.equal(pagamento.status, 'APROVADO')
  })

  test('pedido pago nao aceita nova solicitacao de pagamento', async ({ client, assert }) => {
    const cliente = await criarUsuario('CLIENTE')
    const pedido = await pedidoDe(cliente)
    const pagamento = await pagamentoPendente(cliente, pedido)
    await enviarWebhook(client, eventoPara(pagamento, 'APROVADO'))

    const response = await client
      .post(`/api/v1/pedidos/${pedido.id}/pagamento`)
      .json({ metodo: 'PIX' })
      .loginAs(cliente)

    response.assertStatus(409)
    assert.equal(errorBody(response).error, 'PEDIDO_NAO_AGUARDA_PAGAMENTO')
  })

  test('o cliente acompanha o resultado consultando o pedido', async ({ client, assert }) => {
    const cliente = await criarUsuario('CLIENTE')
    const pedido = await pedidoDe(cliente)
    const solicitacao = await client
      .post(`/api/v1/pedidos/${pedido.id}/pagamento`)
      .json({ metodo: 'PIX' })
      .loginAs(cliente)
    const pagamento = await Pagamento.findOrFail(pagamentoRespondido(solicitacao).data.pagamentoId)

    const antes = await client.get(`/api/v1/pedidos/${pedido.id}`).loginAs(cliente)
    await enviarWebhook(client, eventoPara(pagamento, 'RECUSADO'))
    const depois = await client.get(`/api/v1/pedidos/${pedido.id}`).loginAs(cliente)

    assert.containsSubset(antes.body(), {
      data: { status: 'AGUARDANDO_PAGAMENTO', pagamento: { status: 'PENDENTE' } },
    })
    assert.containsSubset(depois.body(), {
      data: {
        status: 'CANCELADO',
        pagamento: { status: 'RECUSADO', motivoRecusa: MOTIVO, metodo: 'PIX' },
      },
    })
  })

  test('entregas simultaneas esperam a trava e devolvem o estoque uma unica vez', async ({
    client,
    assert,
  }) => {
    const cliente = await criarUsuario('CLIENTE')
    const { pedido, unidade, tapioca } = await pedidoComDoisItens(cliente)
    const pagamento = await pagamentoPendente(cliente, pedido)
    const evento = eventoPara(pagamento, 'RECUSADO')

    const respostas = await comPedidoTravado(
      pedido,
      () => Promise.all([enviarWebhook(client, evento), enviarWebhook(client, evento)]),
      async () => assert.lengthOf(await MovimentacaoEstoque.query().where('tipo', 'ENTRADA'), 0)
    )

    respostas.forEach((response) => response.assertStatus(204))
    assert.equal(await saldoDe(unidade, tapioca), 10)
    assert.lengthOf(await MovimentacaoEstoque.query().where('tipo', 'ENTRADA'), 2)
  })
})
