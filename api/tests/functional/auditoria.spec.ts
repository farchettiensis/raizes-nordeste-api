import type { ApiClient } from '@japa/api-client'
import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import testUtils from '@adonisjs/core/services/test_utils'

import LogAuditoria, { type AcaoAuditoria } from '#models/log_auditoria'
import Pagamento from '#models/pagamento'
import type Pedido from '#models/pedido'
import type Unidade from '#models/unidade'
import type User from '#models/user'
import { GatewayPagamento } from '#services/gateway_pagamento'
import PedidoService from '#services/pedido_service'
import {
  criarCardapio,
  criarEstoque,
  criarProduto,
  criarUnidade,
  criarUsuario,
} from '#tests/helpers/fixtures'
import GatewayFalso from '#tests/helpers/gateway_falso'

const gateway = new GatewayFalso()

async function registrosDe(acao: AcaoAuditoria) {
  return LogAuditoria.query().where('acao', acao).orderBy('id')
}

async function unicoRegistroDe(acao: AcaoAuditoria) {
  const registros = await registrosDe(acao)

  if (registros.length !== 1) {
    throw new Error(`Esperado um registro de ${acao}, encontrados ${registros.length}`)
  }

  return registros[0]
}

async function unidadeComProduto(quantidade = 10) {
  const unidade = await criarUnidade()
  const produto = await criarProduto()
  await criarCardapio(unidade, produto, '18.50')
  await criarEstoque(unidade, produto, quantidade)

  return { unidade, produto }
}

async function pedidoPago(): Promise<{ pedido: Pedido; unidade: Unidade; cliente: User }> {
  const { unidade, produto } = await unidadeComProduto()
  const cliente = await criarUsuario('CLIENTE')
  const pedido = await new PedidoService().criar(cliente, {
    unidadeId: unidade.id,
    canalPedido: 'APP',
    itens: [{ produtoId: produto.id, quantidade: 2 }],
  })
  await Pagamento.create({
    pedidoId: pedido.id,
    metodo: 'PIX',
    valor: pedido.total,
    status: 'APROVADO',
    referenciaExterna: `pag_${pedido.id}`,
  })
  pedido.status = 'PAGO'
  await pedido.save()
  await LogAuditoria.query().delete()

  return { pedido, unidade, cliente }
}

function mudarStatus(client: ApiClient, pedido: Pedido, usuario: User, corpo: object) {
  return client
    .patch(`/api/v1/pedidos/${pedido.id}/status`)
    .json(corpo as never)
    .loginAs(usuario)
}

test.group('Auditoria do pedido', (group) => {
  group.setup(() => {
    app.container.swap(GatewayPagamento, () => gateway)

    return () => app.container.restore(GatewayPagamento)
  })

  group.each.setup(() => {
    gateway.reiniciar()

    return testUtils.db().truncate()
  })

  test('criar pedido registra quem criou, o canal e o total, com ip e requestId', async ({
    client,
    assert,
  }) => {
    const { unidade, produto } = await unidadeComProduto()
    const cliente = await criarUsuario('CLIENTE')

    const response = await client
      .post('/api/v1/pedidos')
      .json({
        unidadeId: unidade.id,
        canalPedido: 'TOTEM',
        itens: [{ produtoId: produto.id, quantidade: 2 }],
      })
      .loginAs(cliente)

    response.assertStatus(201)
    const registro = await unicoRegistroDe('pedido.criado')
    const { pedidoId } = (response.body() as { data: { pedidoId: number } }).data
    assert.containsSubset(registro.toJSON(), {
      usuarioId: cliente.id,
      entidade: 'pedido',
      entidadeId: String(pedidoId),
      dados: { unidadeId: unidade.id, canalPedido: 'TOTEM', total: '37.00', itens: 1 },
    })
    assert.isString(registro.ip)
    assert.equal(registro.requestId, response.header('x-request-id'))
  })

  test('pedido recusado por falta de estoque nao deixa registro', async ({ client, assert }) => {
    const { unidade, produto } = await unidadeComProduto(1)

    const response = await client
      .post('/api/v1/pedidos')
      .json({
        unidadeId: unidade.id,
        canalPedido: 'APP',
        itens: [{ produtoId: produto.id, quantidade: 5 }],
      })
      .loginAs(await criarUsuario('CLIENTE'))

    response.assertStatus(409)
    assert.lengthOf(await registrosDe('pedido.criado'), 0)
  })

  test('mudar status registra o status de origem, o de destino e quem mudou', async ({
    client,
    assert,
  }) => {
    const { pedido } = await pedidoPago()
    const cozinha = await criarUsuario('COZINHA', { unidadeId: pedido.unidadeId })

    const response = await mudarStatus(client, pedido, cozinha, { status: 'EM_PREPARO' })

    response.assertStatus(200)
    const registro = await unicoRegistroDe('pedido.status_alterado')
    assert.containsSubset(registro.toJSON(), {
      usuarioId: cozinha.id,
      entidade: 'pedido',
      entidadeId: String(pedido.id),
      dados: { de: 'PAGO', para: 'EM_PREPARO' },
    })
  })

  test('cancelar registra o motivo, o estorno e a devolucao de estoque', async ({
    client,
    assert,
  }) => {
    const { pedido } = await pedidoPago()
    const gerente = await criarUsuario('GERENTE', { unidadeId: pedido.unidadeId })

    const response = await mudarStatus(client, pedido, gerente, {
      status: 'CANCELADO',
      motivo: 'Cliente desistiu',
    })

    response.assertStatus(200)
    const cancelamento = await unicoRegistroDe('pedido.cancelado')
    assert.containsSubset(cancelamento.toJSON(), {
      usuarioId: gerente.id,
      entidadeId: String(pedido.id),
      dados: { de: 'PAGO', motivo: 'Cliente desistiu', estornado: true, estoqueDevolvido: true },
    })
    const pagamento = await Pagamento.findByOrFail('pedidoId', pedido.id)
    const estorno = await unicoRegistroDe('pagamento.estornado')
    assert.containsSubset(estorno.toJSON(), {
      usuarioId: gerente.id,
      entidade: 'pagamento',
      entidadeId: String(pagamento.id),
      dados: { pedidoId: pedido.id },
    })
    assert.lengthOf(await registrosDe('pedido.status_alterado'), 0)
  })

  test('cancelamento que falha no provedor nao deixa registro', async ({ client, assert }) => {
    const { pedido } = await pedidoPago()
    gateway.foraDoAr = true

    const response = await mudarStatus(
      client,
      pedido,
      await criarUsuario('GERENTE', { unidadeId: pedido.unidadeId }),
      { status: 'CANCELADO', motivo: 'Cliente desistiu' }
    )

    response.assertStatus(503)
    assert.lengthOf(await registrosDe('pedido.cancelado'), 0)
    assert.lengthOf(await registrosDe('pagamento.estornado'), 0)
  })
})
