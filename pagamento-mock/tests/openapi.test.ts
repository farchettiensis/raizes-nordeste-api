import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import { criarApp } from '../src/app.ts'
import { RegistroDePagamentos } from '../src/pagamentos.ts'

const app = criarApp({
  registro: new RegistroDePagamentos(),
  entregador: { entregar: async () => {} },
  taxaFalha: 0,
})

async function operacoesDocumentadas() {
  const documento = await readFile(new URL('../openapi.yaml', import.meta.url), 'utf8')
  const operacoes: { method: 'GET' | 'POST'; url: string }[] = []
  let caminho = ''

  for (const linha of documento.split('\n')) {
    const novoCaminho = /^ {2}(\/\S*):$/.exec(linha)
    const metodo = /^ {4}(get|post):$/.exec(linha)

    if (novoCaminho) {
      caminho = novoCaminho[1].replaceAll(/\{(\w+)\}/g, ':$1')
    } else if (metodo && caminho) {
      operacoes.push({ method: metodo[1].toUpperCase() as 'GET' | 'POST', url: caminho })
    }
  }

  return operacoes
}

test('serve a especificacao OpenAPI', async () => {
  const resposta = await app.inject({ method: 'GET', url: '/openapi.yaml' })

  assert.equal(resposta.statusCode, 200)
  assert.match(resposta.headers['content-type'] as string, /yaml/)
  assert.match(resposta.body, /^openapi: 3/)
})

test('toda operacao documentada existe como rota', async () => {
  await app.ready()
  const operacoes = await operacoesDocumentadas()

  assert.ok(operacoes.length >= 5)
  for (const operacao of operacoes) {
    assert.ok(app.hasRoute(operacao), `${operacao.method} ${operacao.url} nao existe`)
  }
})
