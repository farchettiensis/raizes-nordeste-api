import { parse } from 'yaml'
import { test } from '@japa/runner'
import router from '@adonisjs/core/services/router'

type Operation = {
  responses: Record<string, unknown>
}

type OpenApiDocument = {
  openapi: string
  paths: Record<string, Record<string, Operation>>
}

const DOCS_PATHS = ['/', '/docs', '/docs/openapi.yaml', '/docs/swagger-ui/:file']

function documentedOperations(document: OpenApiDocument) {
  return Object.entries(document.paths).flatMap(([path, operations]) =>
    Object.keys(operations).map((method) => `${method.toUpperCase()} ${path}`)
  )
}

function comoCaminhoOpenApi(pattern: string) {
  return pattern.replace(/:(\w+)/g, '{$1}')
}

function registeredOperations() {
  return router
    .toJSON()
    .root.filter((route) => !DOCS_PATHS.includes(route.pattern))
    .flatMap((route) =>
      route.methods
        .filter((method) => method !== 'HEAD')
        .map((method) => `${method} ${comoCaminhoOpenApi(route.pattern)}`)
    )
}

test.group('Documentacao da API', () => {
  test('a raiz redireciona para a documentacao', async ({ client }) => {
    const response = await client.get('/').redirects(0)

    response.assertStatus(302)
    response.assertHeader('location', '/docs')
  })

  test('serve o Swagger UI apontando para o documento local', async ({ client, assert }) => {
    const response = await client.get('/docs')

    response.assertStatus(200)
    assert.include(response.text(), 'SwaggerUIBundle')
    assert.include(response.text(), '/docs/openapi.yaml')
  })

  test('serve os arquivos do Swagger UI a partir do pacote instalado', async ({
    client,
    assert,
  }) => {
    const response = await client.get('/docs/swagger-ui/swagger-ui.css')

    response.assertStatus(200)
    assert.include(response.text(), 'swagger-ui')
  })

  test('recusa nomes de arquivo fora do padrao', async ({ client, assert }) => {
    const proibidos = [
      '/docs/swagger-ui/..%2F..%2Fpackage.json',
      '/docs/swagger-ui/%2e%2e%2f%2e%2e%2fpackage.json',
      '/docs/swagger-ui/sub%2Fswagger-ui.css',
      '/docs/swagger-ui/package.json',
    ]

    const responses = await Promise.all(proibidos.map((path) => client.get(path)))

    responses.forEach((response, index) => {
      response.assertStatus(404)
      assert.notInclude(response.text(), 'raizes-nordeste-api', proibidos[index])
    })
  })

  test('serve um documento OpenAPI valido e independente do host', async ({ client, assert }) => {
    const response = await client.get('/docs/openapi.yaml')

    response.assertStatus(200)

    const document = parse(response.text()) as OpenApiDocument

    assert.equal(document.openapi, '3.0.3')
    assert.notInclude(response.text(), 'localhost:3333')
    assert.isNotEmpty(document.paths)
  })

  test('documenta exatamente as rotas registradas', async ({ client, assert }) => {
    const response = await client.get('/docs/openapi.yaml')
    const document = parse(response.text()) as OpenApiDocument

    const documented = documentedOperations(document).sort()
    const registered = registeredOperations().sort()

    assert.deepEqual(documented, registered)
  })

  test('toda falha documentada usa o schema de erro padronizado', async ({ client, assert }) => {
    const response = await client.get('/docs/openapi.yaml')
    const document = parse(response.text()) as OpenApiDocument

    const failures = Object.values(document.paths)
      .flatMap((operations) => Object.values(operations))
      .flatMap((operation) => Object.entries(operation.responses))
      .filter(([status]) => Number(status) >= 400)

    assert.isNotEmpty(failures)
    failures.forEach(([status, body]) => {
      assert.property(body, '$ref', `resposta ${status} deveria reusar um componente de erro`)
    })
  })
})
