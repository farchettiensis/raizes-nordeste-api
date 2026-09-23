import type { HttpContext } from '@adonisjs/core/http'

import Unidade from '#models/unidade'
import UnidadeTransformer from '#transformers/unidade_transformer'
import { listarUnidadesValidator } from '#validators/unidade'

const PAGINA_PADRAO = 1
const LIMITE_PADRAO = 10

export default class UnidadesController {
  async index({ request, serialize }: HttpContext) {
    const filtros = await listarUnidadesValidator.validate(request.qs())

    const unidades = await Unidade.query()
      .if(filtros.estado, (query) => query.where('estado', filtros.estado!))
      .if(filtros.cidade, (query) => query.whereILike('cidade', `%${filtros.cidade}%`))
      .if(filtros.ativa !== undefined, (query) => query.where('ativa', filtros.ativa!))
      .orderBy('nome')
      .paginate(filtros.page ?? PAGINA_PADRAO, filtros.limit ?? LIMITE_PADRAO)

    return serialize(UnidadeTransformer.paginate(unidades.all(), unidades.getMeta()))
  }

  async show({ params, serialize }: HttpContext) {
    const unidade = await Unidade.findOrFail(params.id)

    return serialize(UnidadeTransformer.transform(unidade))
  }
}
