import type { ApiClient } from '@japa/api-client'
import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import testUtils from '@adonisjs/core/services/test_utils'

import LogAuditoria, { type AcaoAuditoria } from '#models/log_auditoria'
import Pagamento from '#models/pagamento'
import type Pedido from '#models/pedido'
import type Unidade from '#models/unidade'
import User from '#models/user'
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

  test('um x-request-id longo enviado pelo cliente nao derruba a acao auditada', async ({
    client,
    assert,
  }) => {
    const { unidade, produto } = await unidadeComProduto()

    const response = await client
      .post('/api/v1/pedidos')
      .header('x-request-id', 'x'.repeat(300))
      .json({
        unidadeId: unidade.id,
        canalPedido: 'APP',
        itens: [{ produtoId: produto.id, quantidade: 1 }],
      })
      .loginAs(await criarUsuario('CLIENTE'))

    response.assertStatus(201)
    const registro = await unicoRegistroDe('pedido.criado')
    assert.equal(registro.requestId, 'x'.repeat(40))
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

test.group('Auditoria da autenticacao', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('cadastro registra o perfil, sem nome nem e-mail', async ({ client, assert }) => {
    const response = await client.post('/api/v1/auth/signup').json({
      fullName: 'Maria Bonita',
      email: 'maria@raizes.test',
      password: 'Senha@123',
      passwordConfirmation: 'Senha@123',
      consentimentoDados: true,
    })

    response.assertStatus(201)
    const usuario = await User.findByOrFail('email', 'maria@raizes.test')
    const registro = await unicoRegistroDe('usuario.cadastrado')
    assert.containsSubset(registro.toJSON(), {
      usuarioId: usuario.id,
      entidade: 'user',
      entidadeId: String(usuario.id),
      dados: { perfil: 'CLIENTE' },
    })
    assert.notInclude(JSON.stringify(registro.dados), 'maria')
  })

  test('login registra o acesso de quem entrou', async ({ client, assert }) => {
    const usuario = await criarUsuario('ATENDENTE')

    const response = await client
      .post('/api/v1/auth/login')
      .json({ email: usuario.email, password: 'Senha@123' })

    response.assertStatus(200)
    const registro = await unicoRegistroDe('auth.login')
    assert.containsSubset(registro.toJSON(), {
      usuarioId: usuario.id,
      entidade: 'user',
      entidadeId: String(usuario.id),
      dados: null,
    })
  })

  test('senha errada registra a tentativa contra a conta, sem o e-mail', async ({
    client,
    assert,
  }) => {
    const usuario = await criarUsuario('GERENTE')

    const response = await client
      .post('/api/v1/auth/login')
      .json({ email: usuario.email, password: 'errada-123' })

    response.assertStatus(401)
    const registro = await unicoRegistroDe('auth.login_negado')
    assert.containsSubset(registro.toJSON(), {
      usuarioId: null,
      entidade: 'user',
      entidadeId: String(usuario.id),
      dados: null,
    })
    assert.isString(registro.ip)
  })

  test('e-mail desconhecido tambem registra a tentativa, sem conta alvo', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/v1/auth/login')
      .json({ email: 'ninguem@raizes.test', password: 'qualquer-123' })

    response.assertStatus(401)
    const registro = await unicoRegistroDe('auth.login_negado')
    assert.isNull(registro.entidadeId)
    assert.isNull(registro.usuarioId)
  })

  test('logout registra a saida', async ({ client, assert }) => {
    const usuario = await criarUsuario('CLIENTE')
    const login = await client
      .post('/api/v1/auth/login')
      .json({ email: usuario.email, password: 'Senha@123' })
    const { token } = (login.body() as { data: { token: string } }).data

    const response = await client.post('/api/v1/account/logout').bearerToken(token)

    response.assertStatus(200)
    const registro = await unicoRegistroDe('auth.logout')
    assert.equal(registro.usuarioId, usuario.id)
  })
})

test.group('Auditoria de acessos negados', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('perfil sem permissao na rota registra quem tentou, a rota e o erro', async ({
    client,
    assert,
  }) => {
    const unidade = await criarUnidade()
    const cozinha = await criarUsuario('COZINHA', { unidadeId: unidade.id })

    const response = await client
      .post('/api/v1/pedidos')
      .json({ unidadeId: 1, canalPedido: 'APP', itens: [{ produtoId: 1, quantidade: 1 }] })
      .loginAs(cozinha)

    response.assertStatus(403)
    const registro = await unicoRegistroDe('acesso.negado')
    assert.containsSubset(registro.toJSON(), {
      usuarioId: cozinha.id,
      entidade: 'rota',
      entidadeId: null,
      dados: { metodo: 'POST', rota: '/api/v1/pedidos', params: {}, erro: 'SEM_PERMISSAO' },
      requestId: response.header('x-request-id'),
    })
  })

  test('pedido fora do escopo registra a rota com o id pedido', async ({ client, assert }) => {
    const { pedido } = await pedidoPago()
    const outraUnidade = await criarUnidade()
    const deOutraUnidade = await criarUsuario('ATENDENTE', { unidadeId: outraUnidade.id })

    const response = await client.get(`/api/v1/pedidos/${pedido.id}`).loginAs(deOutraUnidade)

    response.assertStatus(403)
    const registro = await unicoRegistroDe('acesso.negado')
    assert.deepEqual(registro.dados, {
      metodo: 'GET',
      rota: '/api/v1/pedidos/:id',
      params: { id: pedido.id },
      erro: 'SEM_PERMISSAO',
    })
  })

  test('perfil de unidade sem unidade vinculada tambem fica registrado', async ({
    client,
    assert,
  }) => {
    const response = await client.get('/api/v1/pedidos').loginAs(await criarUsuario('GERENTE'))

    response.assertStatus(403)
    const registro = await unicoRegistroDe('acesso.negado')
    assert.equal(registro.dados.erro, 'SEM_UNIDADE_VINCULADA')
  })

  test('requisicao sem token nao gera registro', async ({ client, assert }) => {
    const response = await client.get('/api/v1/pedidos')

    response.assertStatus(401)
    assert.lengthOf(await registrosDe('acesso.negado'), 0)
  })
})

test.group('Consulta da auditoria', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  type Registro = {
    logId: number
    acao: string
    entidade: string
    entidadeId: string | null
    usuarioId: number | null
    dados: Record<string, unknown> | null
    ip: string | null
    requestId: string | null
    createdAt: string
  }

  type Listagem = {
    data: Registro[]
    metadata: { total: number; perPage: number; currentPage: number; lastPage: number }
  }

  function listagem(response: { body(): unknown }) {
    return response.body() as Listagem
  }

  async function semear() {
    const cliente = await criarUsuario('CLIENTE')
    const gerente = await criarUsuario('GERENTE')
    await LogAuditoria.createMany([
      {
        acao: 'auth.login',
        entidade: 'user',
        entidadeId: String(cliente.id),
        usuarioId: cliente.id,
      },
      {
        acao: 'pedido.criado',
        entidade: 'pedido',
        entidadeId: '10',
        usuarioId: cliente.id,
        dados: { canalPedido: 'APP' },
      },
      {
        acao: 'pedido.status_alterado',
        entidade: 'pedido',
        entidadeId: '10',
        usuarioId: gerente.id,
        dados: { de: 'PAGO', para: 'EM_PREPARO' },
      },
      {
        acao: 'pedido.status_alterado',
        entidade: 'pedido',
        entidadeId: '11',
        usuarioId: gerente.id,
        dados: { de: 'PAGO', para: 'EM_PREPARO' },
      },
    ])

    return { cliente, gerente }
  }

  test('sem token responde 401', async ({ client }) => {
    const response = await client.get('/api/v1/auditoria')

    response.assertStatus(401)
  })

  test('so o admin consulta, e a tentativa dos demais fica registrada', async ({
    client,
    assert,
  }) => {
    const unidade = await criarUnidade()
    const gerente = await criarUsuario('GERENTE', { unidadeId: unidade.id })

    const response = await client.get('/api/v1/auditoria').loginAs(gerente)

    response.assertStatus(403)
    const registro = await unicoRegistroDe('acesso.negado')
    assert.equal(registro.usuarioId, gerente.id)
    assert.equal(registro.dados.rota, '/api/v1/auditoria')
  })

  test('o admin lista os registros mais recentes primeiro', async ({ client, assert }) => {
    const { cliente } = await semear()

    const response = await client.get('/api/v1/auditoria').loginAs(await criarUsuario('ADMIN'))

    response.assertStatus(200)
    const { data, metadata } = listagem(response)
    assert.equal(metadata.total, 4)
    assert.deepEqual(
      data.map((registro) => registro.acao),
      ['pedido.status_alterado', 'pedido.status_alterado', 'pedido.criado', 'auth.login']
    )
    assert.containsSubset(data[3], {
      acao: 'auth.login',
      entidade: 'user',
      entidadeId: String(cliente.id),
      usuarioId: cliente.id,
      dados: null,
    })
    assert.properties(data[3], ['logId', 'ip', 'requestId', 'createdAt'])
  })

  test('filtra por acao, por entidade e id, e por usuario', async ({ client, assert }) => {
    const { gerente } = await semear()
    const admin = await criarUsuario('ADMIN')
    const totalCom = async (qs: Record<string, unknown>) => {
      const response = await client.get('/api/v1/auditoria').qs(qs).loginAs(admin)
      response.assertStatus(200)

      return listagem(response).metadata.total
    }

    assert.equal(await totalCom({ acao: 'pedido.status_alterado' }), 2)
    assert.equal(await totalCom({ entidade: 'pedido', entidadeId: '10' }), 2)
    assert.equal(await totalCom({ usuarioId: gerente.id }), 2)
    assert.equal(await totalCom({ acao: 'pedido.criado', usuarioId: gerente.id }), 0)
  })

  test('e paginada e valida os filtros', async ({ client, assert }) => {
    await semear()
    const admin = await criarUsuario('ADMIN')

    const pagina = await client.get('/api/v1/auditoria').qs({ page: 2, limit: 3 }).loginAs(admin)

    pagina.assertStatus(200)
    assert.lengthOf(listagem(pagina).data, 1)
    assert.containsSubset(listagem(pagina).metadata, { total: 4, perPage: 3, currentPage: 2 })

    for (const qs of [{ acao: 'pedido.inventado' }, { entidade: 'cliente' }, { limit: 101 }]) {
      const response = await client
        .get('/api/v1/auditoria')
        .qs(qs as never)
        .loginAs(admin)

      response.assertStatus(422)
    }
  })
})
