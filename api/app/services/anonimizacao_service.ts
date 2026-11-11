import { randomBytes, randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'

import ApiException from '#exceptions/api_exception'
import FidelidadeConta from '#models/fidelidade_conta'
import LogAuditoria from '#models/log_auditoria'
import Pedido from '#models/pedido'
import User from '#models/user'
import { registrarAuditoria } from '#services/auditoria'

export default class AnonimizacaoService {
  async executar(cliente: User, password: string) {
    await db.transaction(async (trx) => {
      const usuario = await User.travadoParaAtualizar(cliente.id, trx)

      if (!(await hash.verify(usuario.password, password))) {
        throw new ApiException('Credenciais invalidas.', {
          code: 'CREDENCIAIS_INVALIDAS',
          status: 401,
        })
      }

      await Pedido.query({ client: trx })
        .where('clienteId', usuario.id)
        .update({ observacoes: null })

      const conta = await FidelidadeConta.travadaDo(usuario.id, trx)
      if (conta && conta.saldoPontos > 0) {
        await conta.lancar({
          tipo: 'EXPIRACAO',
          pontos: -conta.saldoPontos,
          descricao: 'Encerramento da conta',
        })
      }

      usuario.merge({
        fullName: null,
        email: `${randomUUID()}@anonimizado.invalid`,
        password: randomBytes(32).toString('hex'),
        telefone: null,
        dataNascimento: null,
        consentimentoDadosEm: null,
        consentimentoFidelidadeEm: null,
        consentimentoMarketingEm: null,
        anonimizadoEm: DateTime.now(),
      })
      await usuario.save()
      await trx.from('auth_access_tokens').where('tokenable_id', usuario.id).delete()
      await registrarAuditoria(
        { acao: 'usuario.anonimizado', entidade: 'user', entidadeId: usuario.id, usuario },
        trx
      )
      await LogAuditoria.query({ client: trx })
        .where('usuarioId', usuario.id)
        .orWhere((query) => query.where('entidade', 'user').where('entidadeId', String(usuario.id)))
        .update({ ip: null, requestId: null })
    })
  }
}
