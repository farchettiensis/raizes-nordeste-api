import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { criarApp } from '../src/app.ts'
import {
  MOTIVO_RECUSA_PADRAO,
  RegistroDePagamentos,
  type SolicitacaoPagamento,
} from '../src/pagamentos.ts'
import type { Entregador, EventoDePagamento } from '../src/webhook.ts'

class EntregadorFalso implements Entregador {
  eventos: EventoDePagamento[] = []

  async entregar(evento: EventoDePagamento) {
    this.eventos.push(evento)
  }
}

const SOLICITACAO: SolicitacaoPagamento = {
  referencia: 'pagamento-1',
  valor: 2590,
  metodo: 'PIX',
}

function montar({
  taxaFalha = 0,
  sortear = () => 1,
}: { taxaFalha?: number; sortear?: () => number } = {}) {
  const entregador = new EntregadorFalso()
  const app = criarApp({ registro: new RegistroDePagamentos(), entregador, taxaFalha, sortear })

  return { app, entregador }
}

function solicitar(
  app: ReturnType<typeof criarApp>,
  corpo: object = SOLICITACAO,
  chave: string | null = 'chave-1'
) {
  return app.inject({
    method: 'POST',
    url: '/pagamentos',
    headers: chave === null ? {} : { 'idempotency-key': chave },
    payload: corpo,
  })
}

async function criarPendente(app: ReturnType<typeof criarApp>): Promise<string> {
  const resposta = await solicitar(app)

  return resposta.json().id
}

function simular(app: ReturnType<typeof criarApp>, corpo: object) {
  return app.inject({ method: 'POST', url: '/simulacoes', payload: corpo })
}

describe('POST /pagamentos', () => {
  test('cria o pagamento pendente com a cobranca PIX', async () => {
    const { app } = montar()

    const resposta = await solicitar(app)

    assert.equal(resposta.statusCode, 201)
    const pagamento = resposta.json()
    assert.match(pagamento.id, /^pag_/)
    assert.equal(pagamento.status, 'PENDENTE')
    assert.equal(pagamento.valor, 2590)
    assert.equal(pagamento.referencia, 'pagamento-1')
    assert.match(pagamento.pix.copiaECola, /^PIX-MOCK-/)
    assert.equal(pagamento.processadoEm, null)
  })

  test('nao gera cobranca PIX para cartao', async () => {
    const { app } = montar()

    const resposta = await solicitar(app, { ...SOLICITACAO, metodo: 'CARTAO_CREDITO' })

    assert.equal(resposta.statusCode, 201)
    assert.equal(resposta.json().pix, null)
  })

  test('repetir a chave com o mesmo conteudo devolve o pagamento original', async () => {
    const { app } = montar()

    const primeira = await solicitar(app)
    const repetida = await solicitar(app)

    assert.equal(repetida.statusCode, 200)
    assert.deepEqual(repetida.json(), primeira.json())
  })

  test('repetir a chave com outro conteudo e conflito', async () => {
    const { app } = montar()

    await solicitar(app)
    const resposta = await solicitar(app, { ...SOLICITACAO, valor: 9999 })

    assert.equal(resposta.statusCode, 409)
    assert.equal(resposta.json().erro.codigo, 'CHAVE_IDEMPOTENCIA_REUTILIZADA')
  })

  test('exige a chave de idempotencia', async () => {
    const { app } = montar()

    const resposta = await solicitar(app, SOLICITACAO, null)

    assert.equal(resposta.statusCode, 422)
    assert.deepEqual(resposta.json().erro.detalhes[0].campo, 'idempotency-key')
  })

  test('recusa valor que nao e inteiro em centavos e metodo desconhecido', async () => {
    const { app } = montar()

    const resposta = await solicitar(app, { ...SOLICITACAO, valor: '25.90', metodo: 'DINHEIRO' })

    assert.equal(resposta.statusCode, 422)
    const erro = resposta.json().erro
    assert.equal(erro.codigo, 'REQUISICAO_INVALIDA')
    assert.ok(erro.detalhes.length > 0)
  })

  test('recusa JSON malformado', async () => {
    const { app } = montar()

    const resposta = await app.inject({
      method: 'POST',
      url: '/pagamentos',
      headers: { 'idempotency-key': 'chave-1', 'content-type': 'application/json' },
      payload: '{',
    })

    assert.equal(resposta.statusCode, 400)
    assert.equal(resposta.json().erro.codigo, 'REQUISICAO_MALFORMADA')
  })

  test('falha simulada responde 503 sem registrar o pagamento', async () => {
    const sorteios = [0, 1]
    const { app } = montar({ taxaFalha: 0.5, sortear: () => sorteios.shift()! })

    const falha = await solicitar(app)
    const retentativa = await solicitar(app)

    assert.equal(falha.statusCode, 503)
    assert.equal(falha.json().erro.codigo, 'PROVEDOR_INDISPONIVEL')
    assert.equal(retentativa.statusCode, 201)
  })
})

describe('GET /pagamentos/:id', () => {
  test('consulta o pagamento', async () => {
    const { app } = montar()
    const id = await criarPendente(app)

    const resposta = await app.inject({ method: 'GET', url: `/pagamentos/${id}` })

    assert.equal(resposta.statusCode, 200)
    assert.equal(resposta.json().id, id)
  })

  test('responde 404 para pagamento inexistente', async () => {
    const { app } = montar()

    const resposta = await app.inject({ method: 'GET', url: '/pagamentos/pag_inexistente' })

    assert.equal(resposta.statusCode, 404)
    assert.equal(resposta.json().erro.codigo, 'PAGAMENTO_NAO_ENCONTRADO')
  })
})

describe('POST /simulacoes', () => {
  test('aprovacao processa o pagamento e dispara o webhook', async () => {
    const { app, entregador } = montar()
    const id = await criarPendente(app)

    const resposta = await simular(app, { pagamentoId: id, resultado: 'APROVADO' })

    assert.equal(resposta.statusCode, 202)
    assert.equal(resposta.json().pagamento.status, 'APROVADO')
    assert.equal(entregador.eventos.length, 1)
    const [evento] = entregador.eventos
    assert.equal(evento.id, resposta.json().eventoId)
    assert.equal(evento.tipo, 'pagamento.aprovado')
    assert.equal(evento.pagamento.motivoRecusa, null)
    assert.ok(evento.pagamento.processadoEm)

    const consulta = await app.inject({ method: 'GET', url: `/pagamentos/${id}` })
    assert.equal(consulta.json().status, 'APROVADO')
  })

  test('recusa usa o motivo padrao quando nenhum e informado', async () => {
    const { app, entregador } = montar()
    const id = await criarPendente(app)

    await simular(app, { pagamentoId: id, resultado: 'RECUSADO' })

    const [evento] = entregador.eventos
    assert.equal(evento.tipo, 'pagamento.recusado')
    assert.equal(evento.pagamento.status, 'RECUSADO')
    assert.equal(evento.pagamento.motivoRecusa, MOTIVO_RECUSA_PADRAO)
  })

  test('recusa aceita um motivo informado', async () => {
    const { app, entregador } = montar()
    const id = await criarPendente(app)

    await simular(app, { pagamentoId: id, resultado: 'RECUSADO', motivo: 'Saldo insuficiente' })

    assert.equal(entregador.eventos[0].pagamento.motivoRecusa, 'Saldo insuficiente')
  })

  test('nao processa o mesmo pagamento duas vezes', async () => {
    const { app, entregador } = montar()
    const id = await criarPendente(app)

    await simular(app, { pagamentoId: id, resultado: 'APROVADO' })
    const resposta = await simular(app, { pagamentoId: id, resultado: 'RECUSADO' })

    assert.equal(resposta.statusCode, 409)
    assert.equal(resposta.json().erro.codigo, 'PAGAMENTO_JA_PROCESSADO')
    assert.equal(entregador.eventos.length, 1)
  })

  test('responde 404 para pagamento inexistente', async () => {
    const { app } = montar()

    const resposta = await simular(app, { pagamentoId: 'pag_inexistente', resultado: 'APROVADO' })

    assert.equal(resposta.statusCode, 404)
  })

  test('valida o resultado', async () => {
    const { app } = montar()

    const resposta = await simular(app, { pagamentoId: 'pag_1', resultado: 'TALVEZ' })

    assert.equal(resposta.statusCode, 422)
    assert.equal(resposta.json().erro.detalhes[0].campo, 'resultado')
  })
})

test('rota desconhecida responde no formato de erro do provedor', async () => {
  const { app } = montar()

  const resposta = await app.inject({ method: 'GET', url: '/nada' })

  assert.equal(resposta.statusCode, 404)
  assert.equal(resposta.json().erro.codigo, 'ROTA_NAO_ENCONTRADA')
})
