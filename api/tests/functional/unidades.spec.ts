import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'

import { criarUnidade } from '#tests/helpers/fixtures'

type Unidade = {
  id: number
  codigo: string
  nome: string
  estado: string
  cidade: string
  ativa: boolean
}

type ListaDeUnidades = {
  data: Unidade[]
  metadata: { total: number; perPage: number; currentPage: number; lastPage: number }
}

function lista(response: { body(): unknown }) {
  return response.body() as ListaDeUnidades
}

test.group('Unidades', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('lista as unidades ordenadas por nome', async ({ client, assert }) => {
    await criarUnidade({ nome: 'Raizes Olinda', codigo: 'OLI001' })
    await criarUnidade({ nome: 'Raizes Aracaju', codigo: 'ARA001' })
    await criarUnidade({ nome: 'Raizes Natal', codigo: 'NAT001' })

    const response = await client.get('/api/v1/unidades')

    response.assertStatus(200)
    assert.deepEqual(
      lista(response).data.map((unidade) => unidade.nome),
      ['Raizes Aracaju', 'Raizes Natal', 'Raizes Olinda']
    )
  })

  test('a listagem e publica, sem exigir token', async ({ client }) => {
    await criarUnidade()

    const response = await client.get('/api/v1/unidades')

    response.assertStatus(200)
  })

  test('a listagem e paginada e informa o total', async ({ client, assert }) => {
    for (let i = 0; i < 5; i++) {
      await criarUnidade()
    }

    const response = await client.get('/api/v1/unidades?page=2&limit=2')

    response.assertStatus(200)
    assert.lengthOf(lista(response).data, 2)
    assert.containsSubset(lista(response).metadata, {
      total: 5,
      perPage: 2,
      currentPage: 2,
      lastPage: 3,
    })
  })

  test('filtra por estado, cidade e situacao', async ({ client, assert }) => {
    await criarUnidade({ estado: 'PE', cidade: 'Recife', ativa: true })
    await criarUnidade({ estado: 'PB', cidade: 'Campina Grande', ativa: true })
    await criarUnidade({ estado: 'CE', cidade: 'Fortaleza', ativa: false })

    const porEstado = await client.get('/api/v1/unidades?estado=PB')
    const porCidade = await client.get('/api/v1/unidades?cidade=recife')
    const inativas = await client.get('/api/v1/unidades?ativa=false')

    assert.equal(lista(porEstado).metadata.total, 1)
    assert.equal(lista(porEstado).data[0].estado, 'PB')
    assert.equal(lista(porCidade).metadata.total, 1)
    assert.equal(lista(porCidade).data[0].cidade, 'Recife')
    assert.equal(lista(inativas).metadata.total, 1)
    assert.isFalse(lista(inativas).data[0].ativa)
  })

  test('sem o filtro de situacao, devolve ativas e inativas', async ({ client, assert }) => {
    await criarUnidade({ ativa: true })
    await criarUnidade({ ativa: false })

    const response = await client.get('/api/v1/unidades')

    assert.equal(lista(response).metadata.total, 2)
  })

  test('recusa paginacao fora dos limites', async ({ client, assert }) => {
    const acimaDoMaximo = await client.get('/api/v1/unidades?limit=101')
    const paginaZero = await client.get('/api/v1/unidades?page=0')

    acimaDoMaximo.assertStatus(422)
    paginaZero.assertStatus(422)
    assert.equal((acimaDoMaximo.body() as { error: string }).error, 'DADOS_INVALIDOS')
  })

  test('devolve uma unidade pelo id', async ({ client, assert }) => {
    const unidade = await criarUnidade({ nome: 'Raizes Caruaru' })

    const response = await client.get(`/api/v1/unidades/${unidade.id}`)

    response.assertStatus(200)
    assert.containsSubset(response.body(), {
      data: { id: unidade.id, nome: 'Raizes Caruaru' },
    })
  })

  test('responde 404 para unidade inexistente', async ({ client, assert }) => {
    const response = await client.get('/api/v1/unidades/999999')

    response.assertStatus(404)
    assert.equal((response.body() as { error: string }).error, 'RECURSO_NAO_ENCONTRADO')
  })
})
