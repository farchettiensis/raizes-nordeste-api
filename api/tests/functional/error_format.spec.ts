import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import testUtils from '@adonisjs/core/services/test_utils'

import User from '#models/user'

type ErrorBody = {
  error: string
  message: string
  details: { field: string; issue: string }[]
  timestamp: string
  path: string
  requestId: string
}

function errorBody(response: { body(): unknown }) {
  return response.body() as ErrorBody
}

function assertStandardShape(assert: Assert, body: ErrorBody, path: string) {
  assert.properties(body, ['error', 'message', 'details', 'timestamp', 'path', 'requestId'])
  assert.isString(body.error)
  assert.isString(body.message)
  assert.isArray(body.details)
  assert.isString(body.requestId)
  assert.equal(body.path, path)
  assert.match(body.timestamp, /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/)
}

test.group('Formato padrao de erro', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('rota inexistente responde 404 com o corpo padronizado', async ({ client, assert }) => {
    const response = await client.get('/api/v1/nao-existe')

    response.assertStatus(404)
    assertStandardShape(assert, errorBody(response), '/api/v1/nao-existe')
    assert.equal(errorBody(response).error, 'ROTA_NAO_ENCONTRADA')
    assert.isEmpty(errorBody(response).details)
  })

  test('requisicao sem token responde 401 com o corpo padronizado', async ({ client, assert }) => {
    const response = await client.get('/api/v1/account/profile')

    response.assertStatus(401)
    assertStandardShape(assert, errorBody(response), '/api/v1/account/profile')
    assert.equal(errorBody(response).error, 'NAO_AUTENTICADO')
  })

  test('credenciais invalidas respondem 401 sem revelar se o e-mail existe', async ({
    client,
    assert,
  }) => {
    await User.create({
      fullName: 'Dona Francisca',
      email: 'francisca@raizes.test',
      password: 'Senha@123',
    })

    const senhaErrada = await client
      .post('/api/v1/auth/login')
      .json({ email: 'francisca@raizes.test', password: 'SenhaErrada@1' })

    const emailInexistente = await client
      .post('/api/v1/auth/login')
      .json({ email: 'ninguem@raizes.test', password: 'Senha@123' })

    senhaErrada.assertStatus(401)
    emailInexistente.assertStatus(401)
    assertStandardShape(assert, errorBody(senhaErrada), '/api/v1/auth/login')
    assert.equal(errorBody(senhaErrada).error, 'CREDENCIAIS_INVALIDAS')
    assert.equal(errorBody(senhaErrada).message, errorBody(emailInexistente).message)
  })

  test('dados invalidos respondem 422 detalhando cada campo reprovado', async ({
    client,
    assert,
  }) => {
    const response = await client.post('/api/v1/auth/signup').json({
      fullName: null,
      email: 'nao-e-um-email',
      password: 'curta',
      passwordConfirmation: 'outra',
    })

    response.assertStatus(422)
    assertStandardShape(assert, errorBody(response), '/api/v1/auth/signup')
    assert.equal(errorBody(response).error, 'DADOS_INVALIDOS')

    const { details } = errorBody(response)

    assert.includeMembers(
      details.map((detail) => detail.field),
      ['email', 'password', 'passwordConfirmation']
    )
    details.forEach((detail) => {
      assert.isString(detail.field)
      assert.isString(detail.issue)
    })
  })

  test('cada erro recebe um requestId proprio', async ({ client, assert }) => {
    const primeira = await client.get('/api/v1/nao-existe')
    const segunda = await client.get('/api/v1/nao-existe')

    assert.notEqual(errorBody(primeira).requestId, errorBody(segunda).requestId)
  })
})
