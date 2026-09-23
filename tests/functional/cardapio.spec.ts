import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'

import Estoque from '#models/estoque'
import UnidadeProduto from '#models/unidade_produto'
import { criarCardapio, criarEstoque, criarProduto, criarUnidade } from '#tests/helpers/fixtures'

type ItemDoCardapio = {
  produtoId: number
  codigo: string
  nome: string
  preco: string
  disponivel: boolean
}

type Cardapio = {
  data: ItemDoCardapio[]
  metadata: { total: number; perPage: number; currentPage: number }
}

function cardapio(response: { body(): unknown }) {
  return response.body() as Cardapio
}

test.group('Cardápio por unidade', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('lista apenas os produtos ofertados pela unidade, com o preço dela', async ({
    client,
    assert,
  }) => {
    const unidade = await criarUnidade()
    const outraUnidade = await criarUnidade()
    const tapioca = await criarProduto({ nome: 'Tapioca', codigo: 'TAP900' })
    const cuscuz = await criarProduto({ nome: 'Cuscuz', codigo: 'CUS900' })

    await criarCardapio(unidade, tapioca, '22.00')
    await criarEstoque(unidade, tapioca, 10)
    await criarCardapio(outraUnidade, cuscuz, '24.00')
    await criarEstoque(outraUnidade, cuscuz, 10)

    const response = await client.get(`/api/v1/unidades/${unidade.id}/cardapio`)

    response.assertStatus(200)
    assert.lengthOf(cardapio(response).data, 1)
    assert.containsSubset(cardapio(response).data[0], {
      produtoId: tapioca.id,
      nome: 'Tapioca',
      preco: '22.00',
      disponivel: true,
    })
  })

  test('a mesma rede pode cobrar preços diferentes em cada unidade', async ({ client, assert }) => {
    const recife = await criarUnidade()
    const fortaleza = await criarUnidade()
    const produto = await criarProduto()

    await criarCardapio(recife, produto, '22.00')
    await criarEstoque(recife, produto, 5)
    await criarCardapio(fortaleza, produto, '25.50')
    await criarEstoque(fortaleza, produto, 5)

    const emRecife = await client.get(`/api/v1/unidades/${recife.id}/cardapio`)
    const emFortaleza = await client.get(`/api/v1/unidades/${fortaleza.id}/cardapio`)

    assert.equal(cardapio(emRecife).data[0].preco, '22.00')
    assert.equal(cardapio(emFortaleza).data[0].preco, '25.50')
  })

  test('um item sem estoque aparece na lista como indisponível', async ({ client, assert }) => {
    const unidade = await criarUnidade()
    const produto = await criarProduto()

    await criarCardapio(unidade, produto)
    await criarEstoque(unidade, produto, 0)

    const response = await client.get(`/api/v1/unidades/${unidade.id}/cardapio`)

    assert.lengthOf(cardapio(response).data, 1)
    assert.isFalse(cardapio(response).data[0].disponivel)
  })

  test('um item desligado do cardápio da unidade fica indisponível', async ({ client, assert }) => {
    const unidade = await criarUnidade()
    const produto = await criarProduto()
    const oferta = await criarCardapio(unidade, produto)
    await criarEstoque(unidade, produto, 10)

    oferta.disponivel = false
    await oferta.save()

    const response = await client.get(`/api/v1/unidades/${unidade.id}/cardapio`)

    assert.isFalse(cardapio(response).data[0].disponivel)
  })

  test('um produto inativo na rede fica indisponível em toda unidade', async ({
    client,
    assert,
  }) => {
    const unidade = await criarUnidade()
    const produto = await criarProduto()

    await criarCardapio(unidade, produto)
    await criarEstoque(unidade, produto, 10)

    produto.ativo = false
    await produto.save()

    const response = await client.get(`/api/v1/unidades/${unidade.id}/cardapio`)

    assert.isFalse(cardapio(response).data[0].disponivel)
  })

  test('um produto do cardápio sem registro de estoque fica indisponível', async ({
    client,
    assert,
  }) => {
    const unidade = await criarUnidade()
    const produto = await criarProduto()

    await criarCardapio(unidade, produto)

    const response = await client.get(`/api/v1/unidades/${unidade.id}/cardapio`)

    assert.isFalse(cardapio(response).data[0].disponivel)
  })

  test('o cardápio vem ordenado pelo nome do produto', async ({ client, assert }) => {
    const unidade = await criarUnidade()
    const nomes = ['Tapioca', 'Bolo de macaxeira', 'Cuscuz']

    for (const nome of nomes) {
      const produto = await criarProduto({ nome })
      await criarCardapio(unidade, produto)
      await criarEstoque(unidade, produto, 5)
    }

    const response = await client.get(`/api/v1/unidades/${unidade.id}/cardapio`)

    assert.deepEqual(
      cardapio(response).data.map((item) => item.nome),
      ['Bolo de macaxeira', 'Cuscuz', 'Tapioca']
    )
  })

  test('o cardápio é paginado', async ({ client, assert }) => {
    const unidade = await criarUnidade()

    for (let i = 0; i < 4; i++) {
      const produto = await criarProduto()
      await criarCardapio(unidade, produto)
      await criarEstoque(unidade, produto, 5)
    }

    const response = await client.get(`/api/v1/unidades/${unidade.id}/cardapio?page=2&limit=3`)

    assert.lengthOf(cardapio(response).data, 1)
    assert.containsSubset(cardapio(response).metadata, { total: 4, perPage: 3, currentPage: 2 })
  })

  test('uma unidade sem cardápio devolve lista vazia', async ({ client, assert }) => {
    const unidade = await criarUnidade()

    const response = await client.get(`/api/v1/unidades/${unidade.id}/cardapio`)

    response.assertStatus(200)
    assert.isEmpty(cardapio(response).data)
    assert.equal(cardapio(response).metadata.total, 0)
  })

  test('o cardápio de uma unidade inexistente responde 404', async ({ client, assert }) => {
    const response = await client.get('/api/v1/unidades/999999/cardapio')

    response.assertStatus(404)
    assert.equal((response.body() as { error: string }).error, 'RECURSO_NAO_ENCONTRADO')
  })

  test('o estoque de outra unidade não influencia a disponibilidade', async ({
    client,
    assert,
  }) => {
    const semEstoque = await criarUnidade()
    const comEstoque = await criarUnidade()
    const produto = await criarProduto()

    await criarCardapio(semEstoque, produto)
    await criarEstoque(semEstoque, produto, 0)
    await criarCardapio(comEstoque, produto)
    await criarEstoque(comEstoque, produto, 50)

    const vazia = await client.get(`/api/v1/unidades/${semEstoque.id}/cardapio`)
    const abastecida = await client.get(`/api/v1/unidades/${comEstoque.id}/cardapio`)

    assert.isFalse(cardapio(vazia).data[0].disponivel)
    assert.isTrue(cardapio(abastecida).data[0].disponivel)
  })

  test('a consulta do cardápio não vaza dados de outras unidades', async ({ client, assert }) => {
    const unidade = await criarUnidade()
    const outra = await criarUnidade()
    const produto = await criarProduto()

    await criarCardapio(unidade, produto, '10.00')
    await criarEstoque(unidade, produto, 1)
    await criarCardapio(outra, produto, '99.00')
    await criarEstoque(outra, produto, 1)

    const response = await client.get(`/api/v1/unidades/${unidade.id}/cardapio`)

    assert.lengthOf(cardapio(response).data, 1)
    assert.equal(cardapio(response).data[0].preco, '10.00')
    assert.lengthOf(await UnidadeProduto.all(), 2)
    assert.lengthOf(await Estoque.all(), 2)
  })
})
