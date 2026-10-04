export type DetalheDeErro = {
  campo: string
  problema: string
}

export class ErroDoProvedor extends Error {
  readonly status: number
  readonly codigo: string
  readonly detalhes: DetalheDeErro[]

  constructor(status: number, codigo: string, mensagem: string, detalhes: DetalheDeErro[] = []) {
    super(mensagem)
    this.status = status
    this.codigo = codigo
    this.detalhes = detalhes
  }

  get corpo() {
    return { erro: { codigo: this.codigo, mensagem: this.message, detalhes: this.detalhes } }
  }
}
