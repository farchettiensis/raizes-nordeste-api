import type { HttpContext } from '@adonisjs/core/http'

import LogAuditoria from '#models/log_auditoria'
import LogAuditoriaTransformer from '#transformers/log_auditoria_transformer'
import { listarAuditoriaValidator } from '#validators/auditoria'
import { LIMITE_PADRAO, PAGINA_PADRAO } from '#validators/paginacao'

export default class AuditoriaController {
  async index({ request, serialize }: HttpContext) {
    const filtros = await listarAuditoriaValidator.validate(request.qs())

    const registros = await LogAuditoria.query()
      .if(filtros.acao, (query) => query.where('acao', filtros.acao!))
      .if(filtros.entidade, (query) => query.where('entidade', filtros.entidade!))
      .if(filtros.entidadeId, (query) => query.where('entidadeId', filtros.entidadeId!))
      .if(filtros.usuarioId, (query) => query.where('usuarioId', filtros.usuarioId!))
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .paginate(filtros.page ?? PAGINA_PADRAO, filtros.limit ?? LIMITE_PADRAO)

    return serialize(LogAuditoriaTransformer.paginate(registros.all(), registros.getMeta()))
  }
}
