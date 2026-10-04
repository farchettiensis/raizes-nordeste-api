import { readFile } from 'node:fs/promises'

import Fastify, { type FastifyError, type FastifyServerOptions } from 'fastify'

import { ErroDoProvedor } from './erros.ts'
import {
  METODOS,
  RESULTADOS,
  type RegistroDePagamentos,
  type Resultado,
  type SolicitacaoPagamento,
} from './pagamentos.ts'
import { eventoDo, type Entregador } from './webhook.ts'

export type Dependencias = {
  registro: RegistroDePagamentos
  entregador: Entregador
  taxaFalha: number
  sortear?: () => number
  logger?: FastifyServerOptions['logger']
}

const ESPECIFICACAO = new URL('../openapi.yaml', import.meta.url)

type Simulacao = {
  pagamentoId: string
  resultado: Resultado
  motivo?: string
}

const chaveDeIdempotencia = {
  type: 'object',
  required: ['idempotency-key'],
  properties: {
    'idempotency-key': { type: 'string', minLength: 1, maxLength: 255 },
  },
}

const solicitacaoDePagamento = {
  type: 'object',
  required: ['referencia', 'valor', 'metodo'],
  additionalProperties: false,
  properties: {
    referencia: { type: 'string', minLength: 1, maxLength: 80 },
    valor: { type: 'integer', minimum: 1 },
    metodo: { type: 'string', enum: METODOS },
    descricao: { type: 'string', maxLength: 140 },
  },
}

const simulacao = {
  type: 'object',
  required: ['pagamentoId', 'resultado'],
  additionalProperties: false,
  properties: {
    pagamentoId: { type: 'string', minLength: 1 },
    resultado: { type: 'string', enum: RESULTADOS },
    motivo: { type: 'string', minLength: 1, maxLength: 255 },
  },
}

function detalhesDaValidacao(erro: FastifyError) {
  return (erro.validation ?? []).map((falha) => {
    const ausente = falha.params.missingProperty
    const caminho = falha.instancePath.slice(1).replaceAll('/', '.')

    return {
      campo: typeof ausente === 'string' ? [caminho, ausente].filter(Boolean).join('.') : caminho,
      problema: falha.message ?? 'invalido',
    }
  })
}

function traduzirErro(erro: FastifyError | ErroDoProvedor) {
  if (erro instanceof ErroDoProvedor) {
    return erro
  }

  if (erro.validation) {
    return new ErroDoProvedor(
      422,
      'REQUISICAO_INVALIDA',
      'A requisicao tem campos invalidos.',
      detalhesDaValidacao(erro)
    )
  }

  if (erro.statusCode && erro.statusCode < 500) {
    return new ErroDoProvedor(erro.statusCode, 'REQUISICAO_MALFORMADA', erro.message)
  }

  return undefined
}

export function criarApp(dependencias: Dependencias) {
  const { registro, entregador, taxaFalha, sortear = Math.random, logger = false } = dependencias

  const app = Fastify({ logger, ajv: { customOptions: { coerceTypes: false } } })

  app.setErrorHandler<FastifyError | ErroDoProvedor>((erro, request, reply) => {
    const traduzido = traduzirErro(erro)

    if (traduzido) {
      return reply.status(traduzido.status).send(traduzido.corpo)
    }

    request.log.error(erro)

    return reply
      .status(500)
      .send(new ErroDoProvedor(500, 'ERRO_INTERNO', 'Erro interno no provedor.').corpo)
  })

  app.setNotFoundHandler((request, reply) => {
    const erro = new ErroDoProvedor(404, 'ROTA_NAO_ENCONTRADA', `${request.method} ${request.url}`)

    return reply.status(404).send(erro.corpo)
  })

  app.get('/status', async () => ({ status: 'ok' }))

  app.get('/openapi.yaml', async (_request, reply) =>
    reply.type('application/yaml').send(await readFile(ESPECIFICACAO, 'utf8'))
  )

  app.post<{ Body: SolicitacaoPagamento; Headers: { 'idempotency-key': string } }>(
    '/pagamentos',
    { schema: { headers: chaveDeIdempotencia, body: solicitacaoDePagamento } },
    async (request, reply) => {
      if (sortear() < taxaFalha) {
        throw new ErroDoProvedor(503, 'PROVEDOR_INDISPONIVEL', 'Falha simulada no provedor.')
      }

      const { pagamento, repetida } = registro.criar(
        request.headers['idempotency-key'],
        request.body
      )

      return reply.status(repetida ? 200 : 201).send(pagamento)
    }
  )

  app.get<{ Params: { id: string } }>('/pagamentos/:id', async (request) =>
    registro.buscar(request.params.id)
  )

  app.post<{ Body: Simulacao }>(
    '/simulacoes',
    { schema: { body: simulacao } },
    async (request, reply) => {
      const { pagamentoId, resultado, motivo } = request.body
      const evento = eventoDo(registro.processar(pagamentoId, resultado, motivo))

      entregador.entregar(evento).catch((erro: unknown) => {
        request.log.error({ err: erro, eventoId: evento.id }, 'Webhook nao entregue')
      })

      return reply.status(202).send({ eventoId: evento.id, pagamento: evento.pagamento })
    }
  )

  return app
}
