import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'

import User from '#models/user'

test.group('Cadastro de conta', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('o signup responde 201 e persiste a conta', async ({ client, assert }) => {
    const response = await client.post('/api/v1/auth/signup').json({
      fullName: 'Dona Francisca',
      email: 'francisca@raizes.test',
      password: 'Senha@123',
      passwordConfirmation: 'Senha@123',
    })

    response.assertStatus(201)
    assert.isNotNull(await User.findBy('email', 'francisca@raizes.test'))
  })
})
