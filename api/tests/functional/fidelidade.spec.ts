import type { ApiClient } from '@japa/api-client'
import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import testUtils from '@adonisjs/core/services/test_utils'

import Estoque from '#models/estoque'
import FidelidadeConta from '#models/fidelidade_conta'
import FidelidadeMovimento from '#models/fidelidade_movimento'
import LogAuditoria from '#models/log_auditoria'
import Pedido from '#models/pedido'
import type Produto from '#models/produto'
import type Unidade from '#models/unidade'
import type User from '#models/user'
import { GatewayPagamento } from '#services/gateway_pagamento'
import PagamentoService from '#services/pagamento_service'
import PedidoService from '#services/pedido_service'
import {
  aderirAFidelidade,
  criarCardapio,
  criarEstoque,
  criarPedido,
  criarProduto,
  criarUnidade,
  criarUsuario,
} from '#tests/helpers/fixtures'
import GatewayFalso from '#tests/helpers/gateway_falso'
import { comContaTravada } from '#tests/helpers/trava'
import { enviarWebhook, eventoPara } from '#tests/helpers/webhook'

type Fidelidade = {
  data: {
    ativa: boolean
    aderiuEm: string | null
    saldoPontos: number
    regras: { pontosPorReal: number; valorDoPonto: string; limiteDeDescontoPercentual: number }
  }
}

type Movimentos = {
  data: {
    movimentoId: number
    tipo: string
    pontos: number
    saldoResultante: number
    pedidoId: number | null
    descricao: string | null
    createdAt: string
  }[]
  metadata: { total: number; perPage: number; currentPage: number }
}

type PedidoRespondido = {
  data: {
    pedidoId: number
    subtotal: string
    desconto: string
    total: string
    pontosGerados: number
  }
}

type ErrorBody = {
  error: string
  details: { field: string; issue: string }[]
}

const corpo = <T>(response: { body(): unknown }) => response.body() as T

async function contaDe(cliente: User) {
  return FidelidadeConta.query().where('clienteId', cliente.id).firstOrFail()
}

async function movimentosDe(cliente: User) {
  const conta = await contaDe(cliente)

  return FidelidadeMovimento.query().where('contaId', conta.id).orderBy('id')
}

async function cardapioCom(preco: string, quantidade = 10) {
  const unidade = await criarUnidade()
  const produto = await criarProduto()
  await criarCardapio(unidade, produto, preco)
  await criarEstoque(unidade, produto, quantidade)

  return { unidade, produto }
}

async function saldoDeEstoque(unidade: Unidade, produto: Produto) {
  const estoque = await Estoque.query()
    .where('unidadeId', unidade.id)
    .where('produtoId', produto.id)
    .firstOrFail()

  return estoque.quantidade
}

test.group('Adesao a fidelidade', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('sem token responde 401', async ({ client }) => {
    const response = await client.get('/api/v1/fidelidade')

    response.assertStatus(401)
  })

  test('so o cliente participa do programa', async ({ client, assert }) => {
    const atendente = await criarUsuario('ATENDENTE')

    const response = await client
      .post('/api/v1/fidelidade/adesao')
      .json({ consentimento: true })
      .loginAs(atendente)

    response.assertStatus(403)
    assert.equal(corpo<ErrorBody>(response).error, 'SEM_PERMISSAO')
  })

  test('a adesao exige o consentimento explicito', async ({ client, assert }) => {
    const cliente = await criarUsuario()

    for (const body of [{}, { consentimento: false }, { consentimento: 'sim' }]) {
      const response = await client
        .post('/api/v1/fidelidade/adesao')
        .json(body as never)
        .loginAs(cliente)

      response.assertStatus(422)
      assert.equal(corpo<ErrorBody>(response).details[0].field, 'consentimento')
    }

    assert.isNull(await FidelidadeConta.findBy('clienteId', cliente.id))
  })

  test('adere registrando o consentimento, a conta e a auditoria', async ({ client, assert }) => {
    const cliente = await criarUsuario()

    const response = await client
      .post('/api/v1/fidelidade/adesao')
      .json({ consentimento: true })
      .loginAs(cliente)

    response.assertStatus(201)
    const { data } = corpo<Fidelidade>(response)
    assert.isTrue(data.ativa)
    assert.equal(data.saldoPontos, 0)
    assert.isString(data.aderiuEm)

    await cliente.refresh()
    assert.isNotNull(cliente.consentimentoFidelidadeEm)
    const conta = await contaDe(cliente)

    const registro = await LogAuditoria.findByOrFail('acao', 'fidelidade.aderida')
    assert.equal(registro.entidade, 'fidelidade')
    assert.equal(registro.entidadeId, String(conta.id))
    assert.equal(registro.usuarioId, cliente.id)
  })

  test('nao adere duas vezes', async ({ client, assert }) => {
    const cliente = await criarUsuario()
    await aderirAFidelidade(cliente)

    const response = await client
      .post('/api/v1/fidelidade/adesao')
      .json({ consentimento: true })
      .loginAs(cliente)

    response.assertStatus(409)
    assert.equal(corpo<ErrorBody>(response).error, 'FIDELIDADE_JA_ATIVA')
  })

  test('revogar limpa o consentimento e zera o saldo, guardando o extrato', async ({
    client,
    assert,
  }) => {
    const cliente = await criarUsuario()
    const conta = await aderirAFidelidade(cliente, 120)

    const response = await client.delete('/api/v1/fidelidade/adesao').loginAs(cliente)

    response.assertStatus(204)
    await cliente.refresh()
    await conta.refresh()
    assert.isNull(cliente.consentimentoFidelidadeEm)
    assert.equal(conta.saldoPontos, 0)

    const [expiracao] = await movimentosDe(cliente)
    assert.equal(expiracao.tipo, 'EXPIRACAO')
    assert.equal(expiracao.pontos, -120)
    assert.equal(expiracao.saldoResultante, 0)

    const registro = await LogAuditoria.findByOrFail('acao', 'fidelidade.revogada')
    assert.deepEqual(registro.dados, { pontosPerdidos: 120 })
  })

  test('revogar sem adesao ativa responde 409', async ({ client, assert }) => {
    const cliente = await criarUsuario()

    const response = await client.delete('/api/v1/fidelidade/adesao').loginAs(cliente)

    response.assertStatus(409)
    assert.equal(corpo<ErrorBody>(response).error, 'FIDELIDADE_INATIVA')
  })

  test('aderir de novo reaproveita a conta, com saldo zero', async ({ client, assert }) => {
    const cliente = await criarUsuario()
    await aderirAFidelidade(cliente, 50)
    await client.delete('/api/v1/fidelidade/adesao').loginAs(cliente)

    const response = await client
      .post('/api/v1/fidelidade/adesao')
      .json({ consentimento: true })
      .loginAs(cliente)

    response.assertStatus(201)
    assert.equal(corpo<Fidelidade>(response).data.saldoPontos, 0)
    assert.lengthOf(await FidelidadeConta.query().where('clienteId', cliente.id), 1)
  })

  test('consulta o programa mesmo sem adesao, com as regras', async ({ client, assert }) => {
    const cliente = await criarUsuario()

    const response = await client.get('/api/v1/fidelidade').loginAs(cliente)

    response.assertStatus(200)
    assert.deepEqual(corpo<Fidelidade>(response).data, {
      ativa: false,
      aderiuEm: null,
      saldoPontos: 0,
      regras: { pontosPorReal: 1, valorDoPonto: '0.05', limiteDeDescontoPercentual: 50 },
    })
  })

  test('lista o extrato do proprio cliente, do mais recente ao mais antigo', async ({
    client,
    assert,
  }) => {
    const cliente = await criarUsuario()
    const conta = await aderirAFidelidade(cliente, 30)
    const outro = await criarUsuario()
    const contaDoOutro = await aderirAFidelidade(outro, 10)
    await FidelidadeMovimento.createMany([
      { contaId: conta.id, tipo: 'ACUMULO', pontos: 10, saldoResultante: 10 },
      { contaId: conta.id, tipo: 'ACUMULO', pontos: 20, saldoResultante: 30 },
      { contaId: contaDoOutro.id, tipo: 'ACUMULO', pontos: 10, saldoResultante: 10 },
    ])

    const response = await client
      .get('/api/v1/fidelidade/movimentos')
      .qs({ page: 1, limit: 10 })
      .loginAs(cliente)

    response.assertStatus(200)
    const extrato = corpo<Movimentos>(response)
    assert.equal(extrato.metadata.total, 2)
    assert.deepEqual(
      extrato.data.map((movimento) => movimento.pontos),
      [20, 10]
    )
  })
})

test.group('Acumulo de pontos', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  async function entregar(client: ApiClient, cliente: User) {
    const unidade = await criarUnidade()
    const atendente = await criarUsuario('ATENDENTE', { unidadeId: unidade.id })
    const pedido = await criarPedido(unidade, cliente, { status: 'PRONTO', total: '37.90' })

    const response = await client
      .patch(`/api/v1/pedidos/${pedido.id}/status`)
      .json({ status: 'ENTREGUE' })
      .loginAs(atendente)

    return { response, pedido }
  }

  test('a entrega credita um ponto por real pago', async ({ client, assert }) => {
    const cliente = await criarUsuario()
    const conta = await aderirAFidelidade(cliente, 5)

    const { response, pedido } = await entregar(client, cliente)

    response.assertStatus(200)
    assert.equal(corpo<PedidoRespondido>(response).data.pontosGerados, 37)
    await conta.refresh()
    assert.equal(conta.saldoPontos, 42)

    const [acumulo] = await movimentosDe(cliente)
    assert.equal(acumulo.tipo, 'ACUMULO')
    assert.equal(acumulo.pontos, 37)
    assert.equal(acumulo.saldoResultante, 42)
    assert.equal(acumulo.pedidoId, pedido.id)
  })

  test('cliente sem adesao nao acumula', async ({ client, assert }) => {
    const cliente = await criarUsuario()

    const { response } = await entregar(client, cliente)

    response.assertStatus(200)
    assert.equal(corpo<PedidoRespondido>(response).data.pontosGerados, 0)
    assert.lengthOf(await FidelidadeMovimento.all(), 0)
  })

  test('cliente que revogou nao acumula', async ({ client, assert }) => {
    const cliente = await criarUsuario()
    const conta = await aderirAFidelidade(cliente)
    cliente.consentimentoFidelidadeEm = null
    await cliente.save()

    const { response } = await entregar(client, cliente)

    response.assertStatus(200)
    await conta.refresh()
    assert.equal(conta.saldoPontos, 0)
  })
})

test.group('Resgate de pontos', (group) => {
  const gateway = new GatewayFalso()

  group.setup(() => {
    app.container.swap(GatewayPagamento, () => gateway)

    return () => app.container.restore(GatewayPagamento)
  })

  group.each.setup(() => {
    gateway.reiniciar()

    return testUtils.db().truncate()
  })

  function pedirComPontos(
    client: ApiClient,
    cliente: User,
    { unidade, produto }: { unidade: Unidade; produto: Produto },
    pontosResgatados: unknown
  ) {
    return client
      .post('/api/v1/pedidos')
      .json({
        unidadeId: unidade.id,
        canalPedido: 'APP',
        itens: [{ produtoId: produto.id, quantidade: 2 }],
        pontosResgatados,
      } as never)
      .loginAs(cliente)
  }

  test('o resgate vira desconto no pedido e sai do saldo', async ({ client, assert }) => {
    const cliente = await criarUsuario()
    const conta = await aderirAFidelidade(cliente, 200)
    const oferta = await cardapioCom('18.50')

    const response = await pedirComPontos(client, cliente, oferta, 100)

    response.assertStatus(201)
    const { data } = corpo<PedidoRespondido>(response)
    assert.equal(data.subtotal, '37.00')
    assert.equal(data.desconto, '5.00')
    assert.equal(data.total, '32.00')
    await conta.refresh()
    assert.equal(conta.saldoPontos, 100)

    const [resgate] = await movimentosDe(cliente)
    assert.equal(resgate.tipo, 'RESGATE')
    assert.equal(resgate.pontos, -100)
    assert.equal(resgate.saldoResultante, 100)
    assert.equal(resgate.pedidoId, data.pedidoId)
  })

  test('pontos invalidos respondem 422', async ({ client, assert }) => {
    const cliente = await criarUsuario()
    await aderirAFidelidade(cliente, 200)
    const oferta = await cardapioCom('18.50')

    for (const pontos of [0, -10, 1.5, 'cem']) {
      const response = await pedirComPontos(client, cliente, oferta, pontos)

      response.assertStatus(422)
      assert.equal(corpo<ErrorBody>(response).details[0].field, 'pontosResgatados')
    }
  })

  test('sem adesao ativa o resgate responde 409 e nada e gravado', async ({ client, assert }) => {
    const cliente = await criarUsuario()
    const oferta = await cardapioCom('18.50', 5)

    const response = await pedirComPontos(client, cliente, oferta, 10)

    response.assertStatus(409)
    assert.equal(corpo<ErrorBody>(response).error, 'FIDELIDADE_INATIVA')
    assert.lengthOf(await Pedido.all(), 0)
    assert.equal(await saldoDeEstoque(oferta.unidade, oferta.produto), 5)
  })

  test('resgatar mais que o saldo responde 409', async ({ client, assert }) => {
    const cliente = await criarUsuario()
    await aderirAFidelidade(cliente, 50)
    const oferta = await cardapioCom('18.50')

    const response = await pedirComPontos(client, cliente, oferta, 80)

    response.assertStatus(409)
    assert.deepEqual(corpo<ErrorBody>(response), {
      ...corpo<ErrorBody>(response),
      error: 'SALDO_DE_PONTOS_INSUFICIENTE',
      details: [{ field: 'pontosResgatados', issue: 'Saldo: 50' }],
    })
  })

  test('o desconto nao passa de metade do subtotal', async ({ client, assert }) => {
    const cliente = await criarUsuario()
    await aderirAFidelidade(cliente, 1000)
    const oferta = await cardapioCom('18.50')

    const response = await pedirComPontos(client, cliente, oferta, 371)

    response.assertStatus(409)
    assert.deepEqual(corpo<ErrorBody>(response), {
      ...corpo<ErrorBody>(response),
      error: 'DESCONTO_ACIMA_DO_LIMITE',
      details: [{ field: 'pontosResgatados', issue: 'Maximo: 370 pontos' }],
    })

    const noLimite = await pedirComPontos(client, cliente, oferta, 370)
    noLimite.assertStatus(201)
    assert.equal(corpo<PedidoRespondido>(noLimite).data.total, '18.50')
  })

  test('o cancelamento devolve os pontos resgatados', async ({ client, assert }) => {
    const cliente = await criarUsuario()
    const conta = await aderirAFidelidade(cliente, 200)
    const oferta = await cardapioCom('18.50')
    const criado = await pedirComPontos(client, cliente, oferta, 100)
    const { pedidoId } = corpo<PedidoRespondido>(criado).data

    const response = await client
      .patch(`/api/v1/pedidos/${pedidoId}/status`)
      .json({ status: 'CANCELADO', motivo: 'Desisti' })
      .loginAs(cliente)

    response.assertStatus(200)
    await conta.refresh()
    assert.equal(conta.saldoPontos, 200)

    const movimentos = await movimentosDe(cliente)
    const estorno = movimentos.at(-1)!
    assert.equal(estorno.tipo, 'ESTORNO')
    assert.equal(estorno.pontos, 100)
    assert.equal(estorno.saldoResultante, 200)
    assert.equal(estorno.pedidoId, pedidoId)
  })

  test('a recusa do pagamento devolve os pontos resgatados', async ({ client, assert }) => {
    const cliente = await criarUsuario()
    const conta = await aderirAFidelidade(cliente, 200)
    const oferta = await cardapioCom('18.50')
    const pedido = await new PedidoService().criar(cliente, {
      unidadeId: oferta.unidade.id,
      canalPedido: 'APP',
      itens: [{ produtoId: oferta.produto.id, quantidade: 2 }],
      pontosResgatados: 60,
    })
    const pagamento = await new PagamentoService(gateway).solicitar(cliente, pedido.id, 'PIX')

    const response = await enviarWebhook(client, eventoPara(pagamento, 'RECUSADO'))

    response.assertStatus(204)
    await conta.refresh()
    assert.equal(conta.saldoPontos, 200)
    const movimentos = await movimentosDe(cliente)
    assert.equal(movimentos.at(-1)!.tipo, 'ESTORNO')
  })

  test('cancelar depois de revogar nao devolve os pontos', async ({ client, assert }) => {
    const cliente = await criarUsuario()
    const conta = await aderirAFidelidade(cliente, 200)
    const oferta = await cardapioCom('18.50')
    const criado = await pedirComPontos(client, cliente, oferta, 100)
    await client.delete('/api/v1/fidelidade/adesao').loginAs(cliente)

    const response = await client
      .patch(`/api/v1/pedidos/${corpo<PedidoRespondido>(criado).data.pedidoId}/status`)
      .json({ status: 'CANCELADO', motivo: 'Desisti' })
      .loginAs(cliente)

    response.assertStatus(200)
    await conta.refresh()
    assert.equal(conta.saldoPontos, 0)
    const movimentos = await movimentosDe(cliente)
    assert.notInclude(
      movimentos.map((movimento) => movimento.tipo),
      'ESTORNO'
    )
  })

  test('resgates simultaneos nao gastam o mesmo saldo duas vezes', async ({ client, assert }) => {
    const cliente = await criarUsuario()
    const conta = await aderirAFidelidade(cliente, 200)
    const primeira = await cardapioCom('30.00')
    const segunda = await cardapioCom('30.00')

    const respostas = await comContaTravada(
      conta,
      () =>
        Promise.all([
          pedirComPontos(client, cliente, primeira, 150),
          pedirComPontos(client, cliente, segunda, 150),
        ]),
      async () => {
        await conta.refresh()
        assert.equal(conta.saldoPontos, 200)
      }
    )

    assert.sameMembers(
      respostas.map((response) => response.status()),
      [201, 409]
    )
    await conta.refresh()
    assert.equal(conta.saldoPontos, 50)
  })
})
