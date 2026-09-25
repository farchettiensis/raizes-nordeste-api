import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'
import { controllers } from '#generated/controllers'

import { PERFIS_DA_OPERACAO } from '#models/user'

router.get('/', ({ response }) => response.redirect('/docs'))

router.get('/docs', [controllers.Docs, 'index'])
router.get('/docs/openapi.yaml', [controllers.Docs, 'spec'])
router.get('/docs/swagger-ui/:file', [controllers.Docs, 'asset'])

router
  .group(() => {
    router
      .group(() => {
        router.post('signup', [controllers.NewAccount, 'store'])
        router.post('login', [controllers.AccessTokens, 'store'])
      })
      .prefix('auth')
      .as('auth')

    router
      .group(() => {
        router.get('/', [controllers.Unidades, 'index'])
        router.get(':id', [controllers.Unidades, 'show'])
        router.get(':id/cardapio', [controllers.Cardapios, 'index'])
        router
          .get(':id/estoque', [controllers.Estoques, 'index'])
          .use(middleware.perfil({ perfis: PERFIS_DA_OPERACAO }))
      })
      .prefix('unidades')
      .as('unidades')

    router
      .group(() => {
        router.get('profile', [controllers.Profile, 'show'])
        router.post('logout', [controllers.AccessTokens, 'destroy'])
      })
      .prefix('account')
      .as('profile')
      .use(middleware.auth())
  })
  .prefix('/api/v1')
