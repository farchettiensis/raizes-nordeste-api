import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'

import { criarEstoque, criarProduto, criarUnidade, criarUsuario } from '#tests/helpers/fixtures'

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
