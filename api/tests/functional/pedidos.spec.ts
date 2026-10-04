import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'

import Estoque from '#models/estoque'
import MovimentacaoEstoque from '#models/movimentacao_estoque'
import Pedido from '#models/pedido'
import PedidoItem from '#models/pedido_item'
import type Produto from '#models/produto'
import type Unidade from '#models/unidade'
import UnidadeProduto from '#models/unidade_produto'
import {
  criarCardapio,
  criarEstoque,
  criarProduto,
  criarUnidade,
  criarUsuario,
} from '#tests/helpers/fixtures'

type ItemDoPedido = {
  produtoId: number
  nome: string
  quantidade: number
  precoUnitario: string
  subtotal: string
}

type PedidoCriado = {
  data: {
    pedidoId: number
    codigo: string
    unidadeId: number
    canalPedido: string
    status: string
    subtotal: string
    desconto: string
    total: string
    itens: ItemDoPedido[]
    createdAt: string
  }
}

type ErrorBody = {
  error: string
  message: string
  details: { field: string; issue: string }[]
  timestamp: string
  path: string
  requestId: string
}

function pedidoCriado(response: { body(): unknown }) {
  return response.body() as PedidoCriado
}

function errorBody(response: { body(): unknown }) {
  return response.body() as ErrorBody
}

async function ofertar(unidade: Unidade, preco: string, quantidade: number) {
  const produto = await criarProduto({ precoBase: '99.00' })
  await criarCardapio(unidade, produto, preco)
  await criarEstoque(unidade, produto, quantidade)

  return produto
}

async function saldoDe(unidade: Unidade, produto: Produto) {
  const estoque = await Estoque.query()
    .where('unidadeId', unidade.id)
    .where('produtoId', produto.id)
    .firstOrFail()

  return estoque.quantidade
}

test.group('Criacao de pedido', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('sem token responde 401', async ({ client, assert }) => {
    const unidade = await criarUnidade()
    const produto = await ofertar(unidade, '18.50', 5)

    const response = await client.post('/api/v1/pedidos').json({
      unidadeId: unidade.id,
      canalPedido: 'APP',
      itens: [{ produtoId: produto.id, quantidade: 1 }],
    })

    response.assertStatus(401)
    assert.equal(errorBody(response).error, 'NAO_AUTENTICADO')
  })

  test('um perfil da operacao nao cria pedido', async ({ client, assert }) => {
    const unidade = await criarUnidade()
    const produto = await ofertar(unidade, '18.50', 5)
    const atendente = await criarUsuario('ATENDENTE')

    const response = await client
      .post('/api/v1/pedidos')
      .json({
        unidadeId: unidade.id,
        canalPedido: 'BALCAO',
        itens: [{ produtoId: produto.id, quantidade: 1 }],
      })
      .loginAs(atendente)

    response.assertStatus(403)
    assert.equal(errorBody(response).error, 'SEM_PERMISSAO')
  })

  test('cria o pedido com o preco praticado na unidade e o total calculado', async ({
    client,
    assert,
  }) => {
    const unidade = await criarUnidade()
    const tapioca = await ofertar(unidade, '18.90', 5)
    const cuscuz = await ofertar(unidade, '22.35', 5)
    const cliente = await criarUsuario('CLIENTE')

    const response = await client
      .post('/api/v1/pedidos')
      .json({
        unidadeId: unidade.id,
        canalPedido: 'TOTEM',
        itens: [
          { produtoId: tapioca.id, quantidade: 3 },
          { produtoId: cuscuz.id, quantidade: 1 },
        ],
      })
      .loginAs(cliente)

    response.assertStatus(201)
    const { data } = pedidoCriado(response)
    assert.containsSubset(data, {
      unidadeId: unidade.id,
      canalPedido: 'TOTEM',
      status: 'AGUARDANDO_PAGAMENTO',
      subtotal: '79.05',
      desconto: '0.00',
      total: '79.05',
      itens: [
        {
          produtoId: tapioca.id,
          nome: tapioca.nome,
          quantidade: 3,
          precoUnitario: '18.90',
          subtotal: '56.70',
        },
        {
          produtoId: cuscuz.id,
          nome: cuscuz.nome,
          quantidade: 1,
          precoUnitario: '22.35',
          subtotal: '22.35',
        },
      ],
    })
    assert.isString(data.codigo)
    assert.notProperty(data, 'clienteId')

    const pedido = await Pedido.findOrFail(data.pedidoId)
    assert.equal(pedido.clienteId, cliente.id)
  })

  test('baixa o estoque e registra uma saida por item vinculada ao pedido', async ({
    client,
    assert,
  }) => {
    const unidade = await criarUnidade()
    const produto = await ofertar(unidade, '18.50', 5)
    const cliente = await criarUsuario('CLIENTE')

    const response = await client
      .post('/api/v1/pedidos')
      .json({
        unidadeId: unidade.id,
        canalPedido: 'APP',
        itens: [{ produtoId: produto.id, quantidade: 2 }],
      })
      .loginAs(cliente)

    response.assertStatus(201)
    assert.equal(await saldoDe(unidade, produto), 3)

    const movimentacoes = await MovimentacaoEstoque.all()
    assert.lengthOf(movimentacoes, 1)
    assert.containsSubset(movimentacoes[0].serialize(), {
      pedidoId: pedidoCriado(response).data.pedidoId,
      usuarioId: cliente.id,
      tipo: 'SAIDA',
      quantidade: 2,
      saldoResultante: 3,
    })
  })

  test('o item guarda o preco do momento do pedido', async ({ client, assert }) => {
    const unidade = await criarUnidade()
    const produto = await ofertar(unidade, '18.50', 5)
    const cliente = await criarUsuario('CLIENTE')

    const response = await client
      .post('/api/v1/pedidos')
      .json({
        unidadeId: unidade.id,
        canalPedido: 'WEB',
        itens: [{ produtoId: produto.id, quantidade: 1 }],
      })
      .loginAs(cliente)

    await UnidadeProduto.query()
      .where('unidadeId', unidade.id)
      .where('produtoId', produto.id)
      .update({ preco: '25.00' })

    const item = await PedidoItem.findByOrFail('pedidoId', pedidoCriado(response).data.pedidoId)
    assert.equal(item.precoUnitario, '18.50')
    assert.equal(item.nomeProduto, produto.nome)
  })

  test('canalPedido ausente responde 422', async ({ client, assert }) => {
    const unidade = await criarUnidade()
    const produto = await ofertar(unidade, '18.50', 5)
    const cliente = await criarUsuario('CLIENTE')

    const response = await client
      .post('/api/v1/pedidos')
      .json({ unidadeId: unidade.id, itens: [{ produtoId: produto.id, quantidade: 1 }] } as never)
      .loginAs(cliente)

    response.assertStatus(422)
    assert.equal(errorBody(response).error, 'DADOS_INVALIDOS')
    assert.include(
      errorBody(response).details.map((detalhe) => detalhe.field),
      'canalPedido'
    )
  })

  test('canalPedido fora da lista responde 422', async ({ client, assert }) => {
    const unidade = await criarUnidade()
    const produto = await ofertar(unidade, '18.50', 5)
    const cliente = await criarUsuario('CLIENTE')

    const response = await client
      .post('/api/v1/pedidos')
      .json({
        unidadeId: unidade.id,
        canalPedido: 'DRIVE_THRU',
        itens: [{ produtoId: produto.id, quantidade: 1 }],
      } as never)
      .loginAs(cliente)

    response.assertStatus(422)
    assert.include(
      errorBody(response).details.map((detalhe) => detalhe.field),
      'canalPedido'
    )
  })

  test('pedido sem itens responde 422', async ({ client, assert }) => {
    const unidade = await criarUnidade()
    const cliente = await criarUsuario('CLIENTE')

    const response = await client
      .post('/api/v1/pedidos')
      .json({ unidadeId: unidade.id, canalPedido: 'APP', itens: [] })
      .loginAs(cliente)

    response.assertStatus(422)
    assert.include(
      errorBody(response).details.map((detalhe) => detalhe.field),
      'itens'
    )
  })

  test('o mesmo produto repetido nos itens responde 422', async ({ client, assert }) => {
    const unidade = await criarUnidade()
    const produto = await ofertar(unidade, '18.50', 5)
    const cliente = await criarUsuario('CLIENTE')

    const response = await client
      .post('/api/v1/pedidos')
      .json({
        unidadeId: unidade.id,
        canalPedido: 'APP',
        itens: [
          { produtoId: produto.id, quantidade: 1 },
          { produtoId: produto.id, quantidade: 2 },
        ],
      })
      .loginAs(cliente)

    response.assertStatus(422)
    assert.equal(errorBody(response).error, 'DADOS_INVALIDOS')
  })

  test('unidade inexistente responde 404', async ({ client, assert }) => {
    const unidade = await criarUnidade()
    const produto = await ofertar(unidade, '18.50', 5)
    const cliente = await criarUsuario('CLIENTE')

    const response = await client
      .post('/api/v1/pedidos')
      .json({
        unidadeId: 999999,
        canalPedido: 'APP',
        itens: [{ produtoId: produto.id, quantidade: 1 }],
      })
      .loginAs(cliente)

    response.assertStatus(404)
    assert.equal(errorBody(response).error, 'UNIDADE_NAO_ENCONTRADA')
  })

  test('produto inexistente responde 404', async ({ client, assert }) => {
    const unidade = await criarUnidade()
    const cliente = await criarUsuario('CLIENTE')

    const response = await client
      .post('/api/v1/pedidos')
      .json({
        unidadeId: unidade.id,
        canalPedido: 'APP',
        itens: [{ produtoId: 999999, quantidade: 1 }],
      })
      .loginAs(cliente)

    response.assertStatus(404)
    assert.equal(errorBody(response).error, 'PRODUTO_NAO_ENCONTRADO')
    assert.deepEqual(errorBody(response).details, [
      { field: 'itens[0].produtoId', issue: 'Produto 999999 fora do cardapio da unidade' },
    ])
  })

  test('produto fora do cardapio da unidade responde 404', async ({ client, assert }) => {
    const unidade = await criarUnidade()
    const outraUnidade = await criarUnidade()
    const produto = await ofertar(outraUnidade, '18.50', 5)
    const cliente = await criarUsuario('CLIENTE')

    const response = await client
      .post('/api/v1/pedidos')
      .json({
        unidadeId: unidade.id,
        canalPedido: 'APP',
        itens: [{ produtoId: produto.id, quantidade: 1 }],
      })
      .loginAs(cliente)

    response.assertStatus(404)
    assert.equal(errorBody(response).error, 'PRODUTO_NAO_ENCONTRADO')
  })

  test('produto marcado como indisponivel na unidade responde 409', async ({ client, assert }) => {
    const unidade = await criarUnidade()
    const produto = await ofertar(unidade, '18.50', 5)
    await UnidadeProduto.query().where('produtoId', produto.id).update({ disponivel: false })
    const cliente = await criarUsuario('CLIENTE')

    const response = await client
      .post('/api/v1/pedidos')
      .json({
        unidadeId: unidade.id,
        canalPedido: 'APP',
        itens: [{ produtoId: produto.id, quantidade: 1 }],
      })
      .loginAs(cliente)

    response.assertStatus(409)
    assert.equal(errorBody(response).error, 'PRODUTO_INDISPONIVEL')
    assert.deepEqual(errorBody(response).details, [
      { field: 'itens[0].produtoId', issue: `Produto ${produto.id} indisponivel na unidade` },
    ])
  })

  test('produto inativo na rede responde 409', async ({ client, assert }) => {
    const unidade = await criarUnidade()
    const produto = await ofertar(unidade, '18.50', 5)
    produto.ativo = false
    await produto.save()
    const cliente = await criarUsuario('CLIENTE')

    const response = await client
      .post('/api/v1/pedidos')
      .json({
        unidadeId: unidade.id,
        canalPedido: 'APP',
        itens: [{ produtoId: produto.id, quantidade: 1 }],
      })
      .loginAs(cliente)

    response.assertStatus(409)
    assert.equal(errorBody(response).error, 'PRODUTO_INDISPONIVEL')
  })

  test('unidade inativa responde 409', async ({ client, assert }) => {
    const unidade = await criarUnidade({ ativa: false })
    const produto = await ofertar(unidade, '18.50', 5)
    const cliente = await criarUsuario('CLIENTE')

    const response = await client
      .post('/api/v1/pedidos')
      .json({
        unidadeId: unidade.id,
        canalPedido: 'APP',
        itens: [{ produtoId: produto.id, quantidade: 1 }],
      })
      .loginAs(cliente)

    response.assertStatus(409)
    assert.equal(errorBody(response).error, 'UNIDADE_INATIVA')
  })

  test('estoque insuficiente responde 409 apontando cada item e nao persiste nada', async ({
    client,
    assert,
  }) => {
    const unidade = await criarUnidade()
    const comSaldo = await ofertar(unidade, '18.50', 5)
    const quaseEsgotado = await ofertar(unidade, '12.00', 1)
    const semEstoque = await criarProduto()
    await criarCardapio(unidade, semEstoque, '9.90')
    const cliente = await criarUsuario('CLIENTE')

    const response = await client
      .post('/api/v1/pedidos')
      .json({
        unidadeId: unidade.id,
        canalPedido: 'APP',
        itens: [
          { produtoId: comSaldo.id, quantidade: 2 },
          { produtoId: quaseEsgotado.id, quantidade: 2 },
          { produtoId: semEstoque.id, quantidade: 1 },
        ],
      })
      .loginAs(cliente)

    response.assertStatus(409)
    assert.equal(errorBody(response).error, 'ESTOQUE_INSUFICIENTE')
    assert.deepEqual(errorBody(response).details, [
      { field: 'itens[1].quantidade', issue: 'Disponivel: 1' },
      { field: 'itens[2].quantidade', issue: 'Disponivel: 0' },
    ])

    assert.equal(await saldoDe(unidade, comSaldo), 5)
    assert.equal(await saldoDe(unidade, quaseEsgotado), 1)
    assert.lengthOf(await Pedido.all(), 0)
    assert.lengthOf(await MovimentacaoEstoque.all(), 0)
  })

  test('dois pedidos simultaneos pela ultima unidade: um e criado e o outro recebe 409', async ({
    client,
    assert,
  }) => {
    const unidade = await criarUnidade()
    const produto = await ofertar(unidade, '18.50', 1)
    const [primeiro, segundo] = await Promise.all([
      criarUsuario('CLIENTE'),
      criarUsuario('CLIENTE'),
    ])

    const pedir = (cliente: typeof primeiro) =>
      client
        .post('/api/v1/pedidos')
        .json({
          unidadeId: unidade.id,
          canalPedido: 'APP',
          itens: [{ produtoId: produto.id, quantidade: 1 }],
        })
        .loginAs(cliente)

    const respostas = await Promise.all([pedir(primeiro), pedir(segundo)])

    assert.sameMembers(
      respostas.map((resposta) => resposta.status()),
      [201, 409]
    )
    assert.equal(await saldoDe(unidade, produto), 0)
    assert.lengthOf(await Pedido.all(), 1)
  })
})
