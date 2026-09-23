import type Unidade from '#models/unidade'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class UnidadeTransformer extends BaseTransformer<Unidade> {
  toObject() {
    return this.pick(this.resource, [
      'id',
      'codigo',
      'nome',
      'formato',
      'cidade',
      'estado',
      'endereco',
      'telefone',
      'ativa',
    ])
  }
}
