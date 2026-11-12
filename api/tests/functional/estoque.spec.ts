import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'

import Estoque from '#models/estoque'
import LogAuditoria from '#models/log_auditoria'
import MovimentacaoEstoque from '#models/movimentacao_estoque'
import Pedido, { type StatusPedido } from '#models/pedido'
import PedidoItem from '#models/pedido_item'

import {
  criarCardapio,
  criarEstoque,
  criarPedido,
  criarProduto,
  criarUnidade,
  criarUsuario,
} from '#tests/helpers/fixtures'
import { comEstoqueTravado } from '#tests/helpers/trava'

type SaldoDeEstoque = {
  produtoId: number
  codigo: string
  nome: string
  quantidade: number
  quantidadeMinima: number
  abaixoDoMinimo: boolean
}

type Estoques = {
  data: SaldoDeEstoque[]
  metadata: { total: number; perPage: number; currentPage: number }
}

type ErrorBody = {
  error: string
  message: string
  details: { field: string; issue: string }[]
  timestamp: string
  path: string
  requestId: string
}

function estoques(response: { body(): unknown }) {
  return response.body() as Estoques
}

function errorBody(response: { body(): unknown }) {
  return response.body() as ErrorBody
}

test.group('Estoque por unidade', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('a consulta sem token responde 401', async ({ client, assert }) => {
    const unidade = await criarUnidade()

    const response = await client.get(`/api/v1/unidades/${unidade.id}/estoque`)

    response.assertStatus(401)
    assert.equal(errorBody(response).error, 'NAO_AUTENTICADO')
  })

  test('um cliente autenticado nao enxerga o estoque da unidade', async ({ client, assert }) => {
    const unidade = await criarUnidade()
    const cliente = await criarUsuario('CLIENTE')

    const response = await client.get(`/api/v1/unidades/${unidade.id}/estoque`).loginAs(cliente)

    response.assertStatus(403)
    assert.properties(errorBody(response), [
      'error',
      'message',
      'details',
      'timestamp',
      'path',
      'requestId',
    ])
    assert.equal(errorBody(response).error, 'SEM_PERMISSAO')
    assert.equal(errorBody(response).path, `/api/v1/unidades/${unidade.id}/estoque`)
    assert.isEmpty(errorBody(response).details)
  })

  test('o gerente consulta o saldo de cada produto da unidade', async ({ client, assert }) => {
    const unidade = await criarUnidade()
    const produto = await criarProduto({ nome: 'Cuscuz', codigo: 'CUS100' })
    await criarEstoque(unidade, produto, 12)
    const gerente = await criarUsuario('GERENTE', { unidadeId: unidade.id })

    const response = await client.get(`/api/v1/unidades/${unidade.id}/estoque`).loginAs(gerente)

    response.assertStatus(200)
    assert.lengthOf(estoques(response).data, 1)
    assert.containsSubset(estoques(response).data[0], {
      produtoId: produto.id,
      codigo: 'CUS100',
      nome: 'Cuscuz',
      quantidade: 12,
      quantidadeMinima: 2,
      abaixoDoMinimo: false,
    })
  })

  test('a equipe da unidade tambem consulta o estoque', async ({ client, assert }) => {
    const unidade = await criarUnidade()
    const produto = await criarProduto()
    await criarEstoque(unidade, produto, 5)

    const atendente = await criarUsuario('ATENDENTE', { unidadeId: unidade.id })
    const cozinha = await criarUsuario('COZINHA', { unidadeId: unidade.id })
    const admin = await criarUsuario('ADMIN')

    const respostas = await Promise.all(
      [atendente, cozinha, admin].map((usuario) =>
        client.get(`/api/v1/unidades/${unidade.id}/estoque`).loginAs(usuario)
      )
    )

    respostas.forEach((response) => {
      response.assertStatus(200)
      assert.lengthOf(estoques(response).data, 1)
    })
  })

  test('sinaliza o produto que chegou ao minimo', async ({ client, assert }) => {
    const unidade = await criarUnidade()
    const produto = await criarProduto()
    await criarEstoque(unidade, produto, 2)
    const gerente = await criarUsuario('GERENTE', { unidadeId: unidade.id })

    const response = await client.get(`/api/v1/unidades/${unidade.id}/estoque`).loginAs(gerente)

    assert.isTrue(estoques(response).data[0].abaixoDoMinimo)
  })

  test('o saldo vem ordenado pelo nome do produto', async ({ client, assert }) => {
    const unidade = await criarUnidade()
    const gerente = await criarUsuario('GERENTE', { unidadeId: unidade.id })

    for (const nome of ['Tapioca', 'Bolo de macaxeira', 'Cuscuz']) {
      await criarEstoque(unidade, await criarProduto({ nome }))
    }

    const response = await client.get(`/api/v1/unidades/${unidade.id}/estoque`).loginAs(gerente)

    assert.deepEqual(
      estoques(response).data.map((saldo) => saldo.nome),
      ['Bolo de macaxeira', 'Cuscuz', 'Tapioca']
    )
  })

  test('o saldo e paginado', async ({ client, assert }) => {
    const unidade = await criarUnidade()
    const gerente = await criarUsuario('GERENTE', { unidadeId: unidade.id })

    for (let i = 0; i < 4; i++) {
      await criarEstoque(unidade, await criarProduto())
    }

    const response = await client
      .get(`/api/v1/unidades/${unidade.id}/estoque?page=2&limit=3`)
      .loginAs(gerente)

    assert.lengthOf(estoques(response).data, 1)
    assert.containsSubset(estoques(response).metadata, { total: 4, perPage: 3, currentPage: 2 })
  })

  test('a consulta nao mistura o estoque de outra unidade', async ({ client, assert }) => {
    const unidade = await criarUnidade()
    const outra = await criarUnidade()
    const produto = await criarProduto()

    await criarEstoque(unidade, produto, 3)
    await criarEstoque(outra, produto, 99)
    const gerente = await criarUsuario('GERENTE', { unidadeId: unidade.id })

    const response = await client.get(`/api/v1/unidades/${unidade.id}/estoque`).loginAs(gerente)

    assert.lengthOf(estoques(response).data, 1)
    assert.equal(estoques(response).data[0].quantidade, 3)
  })

  test('a equipe de outra unidade nao consulta o estoque', async ({ client, assert }) => {
    const unidade = await criarUnidade()
    const outra = await criarUnidade()
    const gerente = await criarUsuario('GERENTE', { unidadeId: outra.id })

    const response = await client.get(`/api/v1/unidades/${unidade.id}/estoque`).loginAs(gerente)

    response.assertStatus(403)
    assert.equal(errorBody(response).error, 'SEM_PERMISSAO')
  })

  test('perfil de unidade sem unidade vinculada responde 403', async ({ client, assert }) => {
    const unidade = await criarUnidade()
    const atendente = await criarUsuario('ATENDENTE')

    const response = await client.get(`/api/v1/unidades/${unidade.id}/estoque`).loginAs(atendente)

    response.assertStatus(403)
    assert.equal(errorBody(response).error, 'SEM_UNIDADE_VINCULADA')
  })

  test('o estoque de uma unidade inexistente responde 404', async ({ client, assert }) => {
    const gerente = await criarUsuario('GERENTE')

    const response = await client.get('/api/v1/unidades/999999/estoque').loginAs(gerente)

    response.assertStatus(404)
    assert.equal(errorBody(response).error, 'RECURSO_NAO_ENCONTRADO')
  })

  test('o perfil e conferido antes de a unidade existir', async ({ client, assert }) => {
    const cliente = await criarUsuario('CLIENTE')

    const response = await client.get('/api/v1/unidades/999999/estoque').loginAs(cliente)

    response.assertStatus(403)
    assert.equal(errorBody(response).error, 'SEM_PERMISSAO')
  })
})

test.group('Movimentacao manual de estoque', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  async function preparar(quantidade = 10) {
    const unidade = await criarUnidade()
    const produto = await criarProduto()
    const estoque = await criarEstoque(unidade, produto, quantidade)
    const gerente = await criarUsuario('GERENTE', { unidadeId: unidade.id })

    return {
      unidade,
      produto,
      estoque,
      gerente,
      url: `/api/v1/unidades/${unidade.id}/estoque/movimentacoes`,
      dados: {
        produtoId: produto.id,
        tipo: 'ENTRADA' as const,
        quantidade: 5,
        motivo: 'Reposicao semanal',
      },
    }
  }

  test('a entrada soma o saldo e registra o responsavel e a auditoria', async ({
    client,
    assert,
  }) => {
    const { url, dados, estoque, gerente } = await preparar()
    const response = await client.post(url).json(dados).loginAs(gerente)

    response.assertStatus(201)
    await estoque.refresh()
    assert.equal(estoque.quantidade, 15)
    const movimento = await MovimentacaoEstoque.firstOrFail()
    assert.containsSubset(movimento.serialize(), {
      estoqueId: estoque.id,
      pedidoId: null,
      usuarioId: gerente.id,
      tipo: 'ENTRADA',
      quantidade: 5,
      saldoResultante: 15,
      motivo: 'Reposicao semanal',
    })
    assert.containsSubset(response.body(), {
      data: { movimentoId: movimento.id, tipo: 'ENTRADA', quantidade: 5, saldoResultante: 15 },
    })
    const log = await LogAuditoria.findByOrFail('acao', 'estoque.movimentado')
    assert.equal(log.usuarioId, gerente.id)
    assert.equal(log.entidade, 'estoque')
    assert.equal(log.entidadeId, String(estoque.id))
    assert.containsSubset(log.dados, {
      movimentoId: movimento.id,
      saldoAnterior: 10,
      saldoResultante: 15,
      quantidade: 5,
      motivo: 'Reposicao semanal',
    })
  })

  test('o ajuste aceita diferencas positivas e negativas inclusive para zerar', async ({
    client,
    assert,
  }) => {
    const { url, dados, estoque, gerente } = await preparar()

    for (const [quantidade, saldo] of [
      [3, 13],
      [-4, 9],
      [-9, 0],
    ]) {
      const response = await client
        .post(url)
        .json({ ...dados, tipo: 'AJUSTE', quantidade })
        .loginAs(gerente)
      response.assertStatus(201)
      await estoque.refresh()
      assert.equal(estoque.quantidade, saldo)
      const movimento = await MovimentacaoEstoque.query().orderBy('id', 'desc').firstOrFail()
      assert.equal(movimento.quantidade, quantidade)
      assert.equal(movimento.saldoResultante, saldo)
    }
  })

  test('rejeita ajuste que deixaria saldo negativo sem persistir lancamento', async ({
    client,
    assert,
  }) => {
    const { url, dados, estoque, gerente } = await preparar()
    const response = await client
      .post(url)
      .json({ ...dados, tipo: 'AJUSTE', quantidade: -11 })
      .loginAs(gerente)

    response.assertStatus(409)
    assert.equal(errorBody(response).error, 'ESTOQUE_INSUFICIENTE')
    await estoque.refresh()
    assert.equal(estoque.quantidade, 10)
    assert.isEmpty(await MovimentacaoEstoque.all())
    assert.isNull(await LogAuditoria.findBy('acao', 'estoque.movimentado'))
  })

  test('valida tipo quantidade e motivo antes de movimentar', async ({ client, assert }) => {
    const { url, dados, gerente, estoque } = await preparar()
    for (const alteracao of [
      { tipo: 'SAIDA' },
      { tipo: 'INVALIDO' },
      { quantidade: 0 },
      { quantidade: -1 },
      { quantidade: 1.5 },
      { quantidade: 2147483648 },
      { tipo: 'AJUSTE', quantidade: 0 },
      { produtoId: 0 },
      { motivo: '  ' },
      { motivo: 'a'.repeat(256) },
      { motivo: null },
    ]) {
      const response = await client
        .post(url)
        .json({ ...dados, ...alteracao })
        .loginAs(gerente)
      response.assertStatus(422)
      assert.equal(errorBody(response).error, 'DADOS_INVALIDOS')
    }
    await estoque.refresh()
    assert.equal(estoque.quantidade, 10)
    assert.isEmpty(await MovimentacaoEstoque.all())
  })

  test('exige autenticacao e restringe os perfis', async ({ client, assert }) => {
    const { url, dados, unidade } = await preparar()
    const anonima = await client.post(url).json(dados)
    anonima.assertStatus(401)
    for (const perfil of ['CLIENTE', 'ATENDENTE', 'COZINHA'] as const) {
      const usuario = await criarUsuario(perfil, { unidadeId: unidade.id })
      const response = await client.post(url).json(dados).loginAs(usuario)
      response.assertStatus(403)
      assert.equal(errorBody(response).error, 'SEM_PERMISSAO')
    }
    assert.isEmpty(await MovimentacaoEstoque.all())
  })

  test('o gerente precisa estar vinculado a unidade e o admin pode operar qualquer uma', async ({
    client,
    assert,
  }) => {
    const { url, dados, estoque } = await preparar()
    const outra = await criarUnidade()
    for (const unidadeId of [outra.id, null]) {
      const gerente = await criarUsuario('GERENTE', { unidadeId })
      const response = await client.post(url).json(dados).loginAs(gerente)
      response.assertStatus(403)
      assert.equal(errorBody(response).error, unidadeId ? 'SEM_PERMISSAO' : 'SEM_UNIDADE_VINCULADA')
    }
    const response = await client
      .post(url)
      .json(dados)
      .loginAs(await criarUsuario('ADMIN'))
    response.assertStatus(201)
    await estoque.refresh()
    assert.equal(estoque.quantidade, 15)
  })

  test('unidade inexistente ou produto sem saldo cadastrado responde 404', async ({
    client,
    assert,
  }) => {
    const { url, dados, gerente, estoque } = await preparar()
    const semEstoque = await criarProduto()
    for (const produtoId of [999999, semEstoque.id]) {
      const response = await client
        .post(url)
        .json({ ...dados, produtoId })
        .loginAs(gerente)
      response.assertStatus(404)
    }
    const inexistente = await client
      .post('/api/v1/unidades/999999/estoque/movimentacoes')
      .json(dados)
      .loginAs(gerente)
    inexistente.assertStatus(404)
    await estoque.refresh()
    assert.equal(estoque.quantidade, 10)
    assert.isEmpty(await MovimentacaoEstoque.all())
  })

  test('rejeita estouro do saldo como conflito', async ({ client, assert }) => {
    const { url, dados, estoque, gerente } = await preparar(2147483647)
    const response = await client.post(url).json(dados).loginAs(gerente)
    response.assertStatus(409)
    assert.equal(errorBody(response).error, 'SALDO_ESTOQUE_ACIMA_DO_LIMITE')
    await estoque.refresh()
    assert.equal(estoque.quantidade, 2147483647)
    assert.isEmpty(await MovimentacaoEstoque.all())
  })

  test('ajustes concorrentes nao gastam o mesmo saldo duas vezes', async ({ client, assert }) => {
    const { url, dados, estoque, gerente } = await preparar(5)
    const respostas = await Promise.all(
      [1, 2].map(() =>
        client
          .post(url)
          .json({ ...dados, tipo: 'AJUSTE', quantidade: -4 })
          .loginAs(gerente)
      )
    )
    assert.deepEqual(respostas.map((resposta) => resposta.status()).sort(), [201, 409])
    await estoque.refresh()
    assert.equal(estoque.quantidade, 1)
    assert.lengthOf(await MovimentacaoEstoque.all(), 1)
  })

  test('uma falha na auditoria reverte saldo e movimentacao', async ({ client, assert }) => {
    const { url, dados, estoque, gerente } = await preparar()
    await db.rawQuery(
      `ALTER TABLE logs_auditoria ADD CONSTRAINT impedir_movimentacao_teste CHECK (acao <> 'estoque.movimentado')`
    )
    try {
      const response = await client.post(url).json(dados).loginAs(gerente)
      response.assertStatus(500)
      const saldo = await Estoque.findOrFail(estoque.id)
      assert.equal(saldo.quantidade, 10)
      assert.isEmpty(await MovimentacaoEstoque.all())
    } finally {
      await db.rawQuery('ALTER TABLE logs_auditoria DROP CONSTRAINT impedir_movimentacao_teste')
    }
  })

  test('o ajuste espera a baixa concorrente antes de validar o saldo', async ({
    client,
    assert,
  }) => {
    const { url, dados, estoque, gerente } = await preparar(5)
    const response = await comEstoqueTravado(
      estoque,
      () =>
        Promise.resolve(
          client
            .post(url)
            .json({ ...dados, tipo: 'AJUSTE', quantidade: -4 })
            .loginAs(gerente)
        ),
      async (trx) => {
        await Estoque.query({ client: trx }).where('id', estoque.id).update({ quantidade: 2 })
      }
    )

    response.assertStatus(409)
    assert.equal(errorBody(response).error, 'ESTOQUE_INSUFICIENTE')
    await estoque.refresh()
    assert.equal(estoque.quantidade, 2)
    assert.isEmpty(await MovimentacaoEstoque.all())
  })

  test('ids invalidos da unidade respondem 422 antes da consulta ao banco', async ({
    client,
    assert,
  }) => {
    const { dados } = await preparar()
    const admin = await criarUsuario('ADMIN')

    for (const id of ['invalido', '2147483648', '0', '-1', '1.5', '9007199254740993']) {
      const url = `/api/v1/unidades/${id}/estoque`
      const respostas = [
        await client.post(`${url}/movimentacoes`).json(dados).loginAs(admin),
        await client.get(url).loginAs(admin),
      ]

      for (const response of respostas) {
        response.assertStatus(422)
        assert.equal(errorBody(response).error, 'DADOS_INVALIDOS')
        assert.equal(errorBody(response).details[0].field, 'id')
      }
    }
  })

  test('a reposicao preserva espaco para devolver a reserva no cancelamento', async ({
    client,
    assert,
  }) => {
    const { unidade, produto, estoque, gerente, url, dados } = await preparar(1)
    await criarCardapio(unidade, produto)
    const cliente = await criarUsuario()
    const criado = await client
      .post('/api/v1/pedidos')
      .loginAs(cliente)
      .json({
        unidadeId: unidade.id,
        canalPedido: 'APP',
        itens: [{ produtoId: produto.id, quantidade: 1 }],
      })
    criado.assertStatus(201)
    const { data } = criado.body() as { data: { pedidoId: number } }

    for (const tipo of ['ENTRADA', 'AJUSTE']) {
      const recusada = await client
        .post(url)
        .loginAs(gerente)
        .json({ ...dados, tipo, quantidade: 2147483647 })
      recusada.assertStatus(409)
      assert.equal(errorBody(recusada).error, 'SALDO_ESTOQUE_ACIMA_DO_LIMITE')
    }
    await estoque.refresh()
    assert.equal(estoque.quantidade, 0)
    assert.isEmpty(await MovimentacaoEstoque.query().whereNull('pedidoId'))
    assert.isNull(await LogAuditoria.findBy('acao', 'estoque.movimentado'))

    const permitida = await client
      .post(url)
      .loginAs(gerente)
      .json({ ...dados, quantidade: 2147483646 })
    permitida.assertStatus(201)
    const cancelamento = await client
      .patch(`/api/v1/pedidos/${data.pedidoId}/status`)
      .loginAs(cliente)
      .json({ status: 'CANCELADO', motivo: 'Desisti do pedido' })
    cancelamento.assertStatus(200)
    await estoque.refresh()
    assert.equal(estoque.quantidade, 2147483647)
    const pedido = await Pedido.findOrFail(data.pedidoId)
    assert.equal(pedido.status, 'CANCELADO')
  })

  for (const { status, esperado } of [
    { status: 'AGUARDANDO_PAGAMENTO', esperado: 409 },
    { status: 'PAGO', esperado: 409 },
    { status: 'EM_PREPARO', esperado: 201 },
    { status: 'PRONTO', esperado: 201 },
    { status: 'ENTREGUE', esperado: 201 },
    { status: 'CANCELADO', esperado: 201 },
  ] satisfies { status: StatusPedido; esperado: number }[]) {
    test(`a capacidade considera a devolucao do pedido em ${status}`, async ({
      client,
      assert,
    }) => {
      const { unidade, produto, gerente, url, dados } = await preparar(0)
      const pedido = await criarPedido(unidade, await criarUsuario(), { status })
      await PedidoItem.create({
        pedidoId: pedido.id,
        produtoId: produto.id,
        nomeProduto: produto.nome,
        quantidade: 2,
        precoUnitario: '18.50',
        subtotal: '37.00',
      })

      const response = await client
        .post(url)
        .loginAs(gerente)
        .json({ ...dados, quantidade: 2147483646 })
      response.assertStatus(esperado)
      if (esperado === 409) {
        assert.equal(errorBody(response).error, 'SALDO_ESTOQUE_ACIMA_DO_LIMITE')
      }
    })
  }

  test('a capacidade nao soma reservas de outro produto ou unidade', async ({ client }) => {
    const { unidade, produto, gerente, url, dados } = await preparar(0)
    const outroProduto = await criarProduto()
    const outraUnidade = await criarUnidade()
    const cliente = await criarUsuario()

    for (const [unidadeDoPedido, produtoDoPedido] of [
      [outraUnidade, produto],
      [unidade, outroProduto],
    ] as const) {
      const pedido = await criarPedido(unidadeDoPedido, cliente)
      await PedidoItem.create({
        pedidoId: pedido.id,
        produtoId: produtoDoPedido.id,
        nomeProduto: produtoDoPedido.nome,
        quantidade: 2,
        precoUnitario: '18.50',
        subtotal: '37.00',
      })
    }

    const response = await client
      .post(url)
      .loginAs(gerente)
      .json({ ...dados, quantidade: 2147483647 })
    response.assertStatus(201)
  })

  test('a capacidade considera a reserva confirmada enquanto espera a trava', async ({
    client,
    assert,
  }) => {
    const { unidade, produto, estoque, gerente, url, dados } = await preparar(1)
    const pedido = await criarPedido(unidade, await criarUsuario())
    const response = await comEstoqueTravado(
      estoque,
      () =>
        Promise.resolve(
          client
            .post(url)
            .loginAs(gerente)
            .json({ ...dados, quantidade: 2147483647 })
        ),
      async (trx) => {
        await Estoque.query({ client: trx }).where('id', estoque.id).update({ quantidade: 0 })
        await PedidoItem.create(
          {
            pedidoId: pedido.id,
            produtoId: produto.id,
            nomeProduto: produto.nome,
            quantidade: 1,
            precoUnitario: '18.50',
            subtotal: '18.50',
          },
          { client: trx }
        )
      }
    )

    response.assertStatus(409)
    assert.equal(errorBody(response).error, 'SALDO_ESTOQUE_ACIMA_DO_LIMITE')
    await estoque.refresh()
    assert.equal(estoque.quantidade, 0)
    assert.isEmpty(await MovimentacaoEstoque.all())
  })
})
