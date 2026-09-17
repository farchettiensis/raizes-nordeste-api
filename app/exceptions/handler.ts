import app from '@adonisjs/core/services/app'
import { type HttpContext, ExceptionHandler } from '@adonisjs/core/http'

import ApiException, { type ErrorDetail } from '#exceptions/api_exception'

type ErrorBody = {
  error: string
  message: string
  details: ErrorDetail[]
  timestamp: string
  path: string
  requestId?: string
}

type KnownError = {
  error: string
  message: string
  status?: number
}

const KNOWN_ERRORS: Record<string, KnownError> = {
  E_VALIDATION_ERROR: {
    error: 'DADOS_INVALIDOS',
    message: 'Os dados enviados nao passaram na validacao.',
  },
  E_INVALID_CREDENTIALS: {
    error: 'CREDENCIAIS_INVALIDAS',
    message: 'E-mail ou senha invalidos.',
    status: 401,
  },
  E_UNAUTHORIZED_ACCESS: {
    error: 'NAO_AUTENTICADO',
    message: 'Autenticacao necessaria para acessar este recurso.',
  },
  E_AUTHORIZATION_FAILURE: {
    error: 'SEM_PERMISSAO',
    message: 'Seu perfil nao tem permissao para esta acao.',
  },
  E_ROUTE_NOT_FOUND: {
    error: 'ROTA_NAO_ENCONTRADA',
    message: 'A rota solicitada nao existe.',
  },
  E_ROW_NOT_FOUND: {
    error: 'RECURSO_NAO_ENCONTRADO',
    message: 'O recurso solicitado nao foi encontrado.',
  },
}

const INTERNAL_ERROR: KnownError = {
  error: 'ERRO_INTERNO',
  message: 'Erro interno no servidor.',
}

type VineMessage = {
  field: string
  message: string
}

function isValidationError(error: unknown): error is { messages: VineMessage[] } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'messages' in error &&
    Array.isArray((error as { messages: unknown }).messages)
  )
}

function codeOf(error: unknown) {
  return (error as { code?: string })?.code
}

function knownErrorFor(error: unknown) {
  const code = codeOf(error)

  return code ? KNOWN_ERRORS[code] : undefined
}

export default class HttpExceptionHandler extends ExceptionHandler {
  protected debug = !app.inProduction

  protected statusFor(error: unknown) {
    return knownErrorFor(error)?.status ?? (error as { status?: number })?.status ?? 500
  }

  protected detailsFor(error: unknown): ErrorDetail[] {
    if (error instanceof ApiException) {
      return error.details
    }

    if (isValidationError(error)) {
      return error.messages.map(({ field, message }) => ({ field, issue: message }))
    }

    return []
  }

  protected identifyError(error: unknown, status: number): KnownError {
    if (error instanceof ApiException) {
      return { error: error.code ?? INTERNAL_ERROR.error, message: error.message }
    }

    const known = knownErrorFor(error)
    if (known) {
      return known
    }

    if (status < 500 && error instanceof Error) {
      return { error: codeOf(error) ?? INTERNAL_ERROR.error, message: error.message }
    }

    return INTERNAL_ERROR
  }

  protected buildBody(error: unknown, ctx: HttpContext, status: number): ErrorBody {
    const { error: identifier, message } = this.identifyError(error, status)

    return {
      error: identifier,
      message,
      details: this.detailsFor(error),
      timestamp: new Date().toISOString(),
      path: ctx.request.url(),
      requestId: ctx.request.id(),
    }
  }

  async handle(error: unknown, ctx: HttpContext) {
    const status = this.statusFor(error)

    ctx.response.status(status)

    return ctx.response.send(this.buildBody(error, ctx, status))
  }

  async report(error: unknown, ctx: HttpContext) {
    return super.report(error, ctx)
  }
}
