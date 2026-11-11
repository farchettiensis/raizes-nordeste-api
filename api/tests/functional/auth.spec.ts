import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'

import User from '#models/user'

test.group('Cadastro de conta', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('o signup responde 201 e persiste a conta', async ({ client, assert }) => {
    const antes = Date.now()
    const response = await client.post('/api/v1/auth/signup').json({
      fullName: 'Dona Francisca',
      email: 'francisca@raizes.test',
      password: 'Senha@123',
      passwordConfirmation: 'Senha@123',
      consentimentoDados: true,
    })

    response.assertStatus(201)
    const usuario = await User.findByOrFail('email', 'francisca@raizes.test')
    assert.isNotNull(usuario.consentimentoDadosEm)
    assert.isAtLeast(usuario.consentimentoDadosEm!.toMillis(), antes)
    assert.isAtMost(usuario.consentimentoDadosEm!.toMillis(), Date.now())
    assert.isNull(usuario.consentimentoFidelidadeEm)
    assert.isNull(usuario.consentimentoMarketingEm)
    assert.notProperty(response.body().data.user, 'password')
  })
})

test.group('Consentimento de dados', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  for (const consentimentoDados of [undefined, false, 'true', null]) {
    test(`recusa cadastro com consentimento ${consentimentoDados}`, async ({ client, assert }) => {
      const response = await client.post('/api/v1/auth/signup').json({
        fullName: null,
        email: 'sem-consentimento@raizes.test',
        password: 'Senha@123',
        passwordConfirmation: 'Senha@123',
        consentimentoDados,
      } as never)

      response.assertStatus(422)
      assert.isNull(await User.findBy('email', 'sem-consentimento@raizes.test'))
      assert.include(
        (response.body() as unknown as { details: { field: string }[] }).details.map(
          (detail: { field: string }) => detail.field
        ),
        'consentimentoDados'
      )
    })
  }
})
