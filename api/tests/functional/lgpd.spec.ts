import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import { DateTime } from 'luxon'

import User from '#models/user'
import Pedido from '#models/pedido'
import PedidoService from '#services/pedido_service'
import LogAuditoria from '#models/log_auditoria'
import FidelidadeMovimento from '#models/fidelidade_movimento'
import {
  aderirAFidelidade,
  criarCardapio,
  criarEstoque,
  criarPedido,
  criarProduto,
  criarUnidade,
  criarUsuario,
} from '#tests/helpers/fixtures'

test.group('Anonimizacao da conta', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('remove identificadores, revoga tokens e fidelidade e preserva historico', async ({
    client,
    assert,
  }) => {
    const cliente = await criarUsuario('CLIENTE', {
      telefone: '81999999999',
      dataNascimento: DateTime.fromISO('1990-01-01'),
      consentimentoDadosEm: DateTime.now(),
      consentimentoMarketingEm: DateTime.now(),
    })
    const email = cliente.email
    const outro = await criarUsuario()
    const conta = await aderirAFidelidade(cliente, 100)
    const pedido = await criarPedido(await criarUnidade(), cliente, {
      observacoes: 'Ligar para 81999999999',
    })
    await LogAuditoria.create({
      acao: 'auth.login',
      entidade: 'user',
      usuarioId: cliente.id,
      ip: '127.0.0.1',
      requestId: 'acesso',
    })
    const tokens = await Promise.all([
      User.accessTokens.create(cliente),
      User.accessTokens.create(cliente),
    ])
    const response = await client
      .delete('/api/v1/clientes/conta')
      .bearerToken(tokens[0].value!.release())
      .json({ password: 'Senha@123' })
    response.assertStatus(204)
    await cliente.refresh()
    assert.isNull(cliente.fullName)
    assert.isNull(cliente.telefone)
    assert.isNull(cliente.dataNascimento)
    assert.isNull(cliente.consentimentoDadosEm)
    assert.isNull(cliente.consentimentoFidelidadeEm)
    assert.isNull(cliente.consentimentoMarketingEm)
    assert.isNotNull(cliente.anonimizadoEm)
    assert.notEqual(cliente.email, email)
    assert.isFalse(await hash.verify(cliente.password, 'Senha@123'))
    assert.lengthOf(await User.accessTokens.all(cliente), 0)
    await conta.refresh()
    assert.equal(conta.saldoPontos, 0)
    const movimento = await FidelidadeMovimento.query().where('contaId', conta.id).firstOrFail()
    assert.equal(movimento.tipo, 'EXPIRACAO')
    assert.equal(movimento.pontos, -100)
    await pedido.refresh()
    assert.equal(pedido.clienteId, cliente.id)
    assert.isNull(pedido.observacoes)
    const registros = await LogAuditoria.query().where('usuarioId', cliente.id)
    assert.isTrue(registros.some((registro) => registro.acao === 'usuario.anonimizado'))
    for (const registro of registros) {
      assert.isNull(registro.ip)
      assert.isNull(registro.requestId)
    }
    await outro.refresh()
    assert.isNull(outro.anonimizadoEm)
    for (const token of tokens) {
      const acesso = await client.get('/api/v1/account/profile').bearerToken(token.value!.release())
      acesso.assertStatus(401)
    }
    const login = await client.post('/api/v1/auth/login').json({ email, password: 'Senha@123' })
    login.assertStatus(401)
  })

  test('senha incorreta nao altera a conta nem seus tokens', async ({ client, assert }) => {
    const cliente = await criarUsuario()
    const token = await User.accessTokens.create(cliente)
    const response = await client
      .delete('/api/v1/clientes/conta')
      .bearerToken(token.value!.release())
      .json({ password: 'errada' })
    response.assertStatus(401)
    await cliente.refresh()
    assert.isNull(cliente.anonimizadoEm)
    assert.lengthOf(await User.accessTokens.all(cliente), 1)
  })

  test('exige autenticacao e confirmacao de senha', async ({ client }) => {
    const anonimo = await client.delete('/api/v1/clientes/conta').json({ password: 'Senha@123' })
    anonimo.assertStatus(401)
    const semSenha = await client
      .delete('/api/v1/clientes/conta')
      .loginAs(await criarUsuario())
      .json({} as never)
    semSenha.assertStatus(422)
  })

  test('equipe nao pode encerrar a conta por esta rota', async ({ client, assert }) => {
    for (const perfil of ['ADMIN', 'GERENTE', 'ATENDENTE', 'COZINHA'] as const) {
      const usuario = await criarUsuario(perfil)
      const response = await client
        .delete('/api/v1/clientes/conta')
        .loginAs(usuario)
        .json({ password: 'Senha@123' })
      response.assertStatus(403)
      await usuario.refresh()
      assert.isNull(usuario.anonimizadoEm)
    }
  })

  test('falha na auditoria desfaz dados, pontos e revogacao de tokens', async ({
    client,
    assert,
  }) => {
    const cliente = await criarUsuario()
    const conta = await aderirAFidelidade(cliente, 100)
    const pedido = await criarPedido(await criarUnidade(), cliente, { observacoes: 'Sem cebola' })
    const token = await User.accessTokens.create(cliente)
    const email = cliente.email
    await db.rawQuery(
      "ALTER TABLE logs_auditoria ADD CONSTRAINT impedir_anonimizacao CHECK (acao <> 'usuario.anonimizado') NOT VALID"
    )
    try {
      const response = await client
        .delete('/api/v1/clientes/conta')
        .bearerToken(token.value!.release())
        .json({ password: 'Senha@123' })
      response.assertStatus(500)
      await cliente.refresh()
      await conta.refresh()
      await pedido.refresh()
      assert.equal(cliente.email, email)
      assert.isNull(cliente.anonimizadoEm)
      assert.isNotNull(cliente.consentimentoFidelidadeEm)
      assert.equal(conta.saldoPontos, 100)
      assert.equal(pedido.observacoes, 'Sem cebola')
      assert.lengthOf(await User.accessTokens.all(cliente), 1)
      assert.lengthOf(await FidelidadeMovimento.all(), 0)
    } finally {
      await db.rawQuery('ALTER TABLE logs_auditoria DROP CONSTRAINT impedir_anonimizacao')
    }
  })

  test('conta marcada como anonimizada nao autentica nem usa tokens remanescentes', async ({
    client,
  }) => {
    const cliente = await criarUsuario('CLIENTE', { anonimizadoEm: DateTime.now() })
    const token = await User.accessTokens.create(cliente)
    const login = await client
      .post('/api/v1/auth/login')
      .json({ email: cliente.email, password: 'Senha@123' })
    login.assertStatus(401)
    const perfil = await client.get('/api/v1/account/profile').bearerToken(token.value!.release())
    perfil.assertStatus(401)
    const fidelidade = await client.get('/api/v1/fidelidade').bearerToken(token.value!.release())
    fidelidade.assertStatus(401)
  })

  test('pedido com usuario autenticado antes do encerramento revalida a conta', async ({
    assert,
  }) => {
    const cliente = await criarUsuario()
    const unidade = await criarUnidade()
    const produto = await criarProduto()
    await criarCardapio(unidade, produto)
    const estoque = await criarEstoque(unidade, produto, 10)
    await User.query().where('id', cliente.id).update({ anonimizadoEm: DateTime.now() })

    await assert.rejects(
      () =>
        new PedidoService().criar(cliente, {
          unidadeId: unidade.id,
          canalPedido: 'APP',
          itens: [{ produtoId: produto.id, quantidade: 1 }],
          observacoes: 'Meu telefone 81999999999',
        }),
      'Autenticacao necessaria para acessar este recurso.'
    )

    assert.lengthOf(await Pedido.all(), 0)
    await estoque.refresh()
    assert.equal(estoque.quantidade, 10)
  })
})
