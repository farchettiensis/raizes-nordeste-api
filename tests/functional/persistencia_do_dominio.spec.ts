import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'

import FidelidadeConta from '#models/fidelidade_conta'
import Pagamento from '#models/pagamento'
import Pedido from '#models/pedido'
import PedidoItem from '#models/pedido_item'
import Estoque from '#models/estoque'
import MovimentacaoEstoque from '#models/movimentacao_estoque'
import {
  criarCardapio,
  criarEstoque,
  criarProduto,
  criarUnidade,
  criarUsuario,
} from '#tests/helpers/fixtures'

test.group('Persistencia do dominio', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('um pedido guarda itens, pagamento, canal e unidade', async ({ assert }) => {
    const unidade = await criarUnidade()
    const produto = await criarProduto()
    const cliente = await criarUsuario('CLIENTE')
    await criarCardapio(unidade, produto, '20.00')

    const pedido = await Pedido.create({
      codigo: 'PD0001',
      unidadeId: unidade.id,
      clienteId: cliente.id,
      canalPedido: 'TOTEM',
      subtotal: '40.00',
      desconto: '0',
      total: '40.00',
    })

    await PedidoItem.create({
      pedidoId: pedido.id,
      produtoId: produto.id,
      nomeProduto: produto.nome,
      quantidade: 2,
      precoUnitario: '20.00',
      subtotal: '40.00',
    })

    await Pagamento.create({
      pedidoId: pedido.id,
      metodo: 'PIX',
      valor: '40.00',
      payloadRequisicao: { valor: '40.00' },
    })

    const salvo = await Pedido.query()
      .where('id', pedido.id)
      .preload('itens')
      .preload('pagamento')
      .preload('unidade')
      .preload('cliente')
      .firstOrFail()

    assert.equal(salvo.canalPedido, 'TOTEM')
    assert.equal(salvo.status, 'AGUARDANDO_PAGAMENTO')
    assert.lengthOf(salvo.itens, 1)
    assert.equal(salvo.itens[0].nomeProduto, produto.nome)
    assert.equal(salvo.pagamento.status, 'PENDENTE')
    assert.equal(salvo.unidade.id, unidade.id)
    assert.equal(salvo.cliente.id, cliente.id)
  })

  test('o canal do pedido e obrigatorio', async ({ assert }) => {
    const unidade = await criarUnidade()

    await assert.rejects(
      () =>
        Pedido.create({
          codigo: 'PD0003',
          unidadeId: unidade.id,
        } as never),
      /canal_pedido/
    )
  })

  test('o pedido pode ser filtrado por canal', async ({ assert }) => {
    const unidade = await criarUnidade()

    await Pedido.createMany([
      { codigo: 'PD0010', unidadeId: unidade.id, canalPedido: 'APP' },
      { codigo: 'PD0011', unidadeId: unidade.id, canalPedido: 'TOTEM' },
      { codigo: 'PD0012', unidadeId: unidade.id, canalPedido: 'TOTEM' },
    ])

    const totem = await Pedido.query().where('canal_pedido', 'TOTEM')

    assert.lengthOf(totem, 2)
  })

  test('o estoque nao aceita saldo negativo', async ({ assert }) => {
    const unidade = await criarUnidade()
    const produto = await criarProduto()
    const estoque = await criarEstoque(unidade, produto, 5)

    estoque.quantidade = -1

    await assert.rejects(() => estoque.save(), /estoques_quantidade_check/)
  })

  test('cada movimentacao de estoque registra o saldo resultante', async ({ assert }) => {
    const unidade = await criarUnidade()
    const produto = await criarProduto()
    const operador = await criarUsuario('ATENDENTE', { unidadeId: unidade.id })
    const estoque = await criarEstoque(unidade, produto, 10)

    await MovimentacaoEstoque.create({
      estoqueId: estoque.id,
      usuarioId: operador.id,
      tipo: 'SAIDA',
      quantidade: 3,
      saldoResultante: 7,
      motivo: 'Venda no balcao',
    })

    estoque.quantidade = 7
    await estoque.save()

    const comHistorico = await Estoque.query()
      .where('id', estoque.id)
      .preload('movimentacoes')
      .firstOrFail()

    assert.lengthOf(comHistorico.movimentacoes, 1)
    assert.equal(comHistorico.movimentacoes[0].saldoResultante, 7)
    assert.equal(comHistorico.quantidade, 7)
  })

  test('a mesma unidade nao repete o mesmo produto no cardapio nem no estoque', async ({
    assert,
  }) => {
    const unidade = await criarUnidade()
    const produto = await criarProduto()

    await criarCardapio(unidade, produto)
    await criarEstoque(unidade, produto)

    await assert.rejects(
      () => criarCardapio(unidade, produto),
      /unidade_produtos_unidade_id_produto_id_unique/
    )
    await assert.rejects(
      () => criarEstoque(unidade, produto),
      /estoques_unidade_id_produto_id_unique/
    )
  })

  test('o item do pedido exige quantidade positiva', async ({ assert }) => {
    const unidade = await criarUnidade()
    const produto = await criarProduto()
    const pedido = await Pedido.create({
      codigo: 'PD0020',
      unidadeId: unidade.id,
      canalPedido: 'BALCAO',
    })

    await assert.rejects(
      () =>
        PedidoItem.create({
          pedidoId: pedido.id,
          produtoId: produto.id,
          nomeProduto: produto.nome,
          quantidade: 0,
          precoUnitario: '20.00',
          subtotal: '0.00',
        }),
      /pedido_itens_quantidade_check/
    )
  })

  test('a conta de fidelidade e unica por cliente', async ({ assert }) => {
    const cliente = await criarUsuario('CLIENTE')

    await FidelidadeConta.create({ clienteId: cliente.id, aderiuEm: DateTime.now() })

    await assert.rejects(
      () => FidelidadeConta.create({ clienteId: cliente.id, aderiuEm: DateTime.now() }),
      /fidelidade_contas_cliente_id_unique/
    )
  })

  test('a senha nunca aparece na serializacao do usuario', async ({ assert }) => {
    const cliente = await criarUsuario('CLIENTE')

    assert.notProperty(cliente.serialize(), 'password')
  })

  test('o codigo do pedido e unico em toda a rede', async ({ assert }) => {
    const unidade = await criarUnidade()
    const outra = await criarUnidade()

    await Pedido.create({ codigo: 'PD9999', unidadeId: unidade.id, canalPedido: 'WEB' })

    await assert.rejects(
      () => Pedido.create({ codigo: 'PD9999', unidadeId: outra.id, canalPedido: 'WEB' }),
      /pedidos_codigo_unique/
    )
  })
})
