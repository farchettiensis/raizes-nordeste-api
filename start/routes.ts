import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'
import { controllers } from '#generated/controllers'

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
