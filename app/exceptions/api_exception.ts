import { Exception } from '@adonisjs/core/exceptions'

export type ErrorDetail = {
  field: string
  issue: string
}

export type ApiExceptionOptions = {
  code: string
  status: number
  details?: ErrorDetail[]
}

export default class ApiException extends Exception {
  declare details: ErrorDetail[]

  constructor(message: string, options: ApiExceptionOptions) {
    super(message, { code: options.code, status: options.status })
    this.details = options.details ?? []
  }
}
