import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { extname, join, sep } from 'node:path'
import app from '@adonisjs/core/services/app'
import type { HttpContext } from '@adonisjs/core/http'

import ApiException from '#exceptions/api_exception'

const swaggerUiPath = createRequire(import.meta.url)('swagger-ui-dist').absolutePath()

const ASSET_CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

const ASSET_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/

const PAGE = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API Raizes do Nordeste</title>
    <link rel="stylesheet" href="/docs/swagger-ui/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/docs/swagger-ui/swagger-ui-bundle.js"></script>
    <script src="/docs/swagger-ui/swagger-ui-standalone-preset.js"></script>
    <script>
      window.addEventListener('load', function () {
        window.ui = SwaggerUIBundle({
          url: '/docs/openapi.yaml',
          dom_id: '#swagger-ui',
          presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
          layout: 'StandaloneLayout',
        })
      })
    </script>
  </body>
</html>`

function resolveAsset(fileName: string) {
  if (!ASSET_NAME_PATTERN.test(fileName)) {
    return null
  }

  const contentType = ASSET_CONTENT_TYPES[extname(fileName)]
  if (!contentType) {
    return null
  }

  const absolutePath = join(swaggerUiPath, fileName)
  if (!absolutePath.startsWith(`${swaggerUiPath}${sep}`)) {
    return null
  }

  return { absolutePath, contentType }
}

function assetNotFound() {
  return new ApiException('Arquivo da documentacao nao encontrado.', {
    code: 'RECURSO_NAO_ENCONTRADO',
    status: 404,
  })
}

export default class DocsController {
  async index({ response }: HttpContext) {
    response.type('text/html; charset=utf-8')

    return PAGE
  }

  async spec({ response }: HttpContext) {
    response.type('text/yaml; charset=utf-8')

    return readFile(app.makePath('openapi.yaml'), 'utf8')
  }

  async asset({ params, response }: HttpContext) {
    const asset = resolveAsset(String(params.file))

    if (!asset) {
      throw assetNotFound()
    }

    const content = await readFile(asset.absolutePath).catch(() => {
      throw assetNotFound()
    })

    response.type(asset.contentType)

    return content
  }
}
