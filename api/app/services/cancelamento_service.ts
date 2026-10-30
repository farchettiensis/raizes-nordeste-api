import { inject } from '@adonisjs/core'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'

import ApiException from '#exceptions/api_exception'
import Estoque from '#models/estoque'
import Pagamento from '#models/pagamento'
import Pedido from '#models/pedido'
import type User from '#models/user'
import { registrarAuditoria } from '#services/auditoria'
import { garantirPedidoVisivel } from '#services/escopo_de_acesso'
import { GatewayPagamento, type RespostaDoEstorno } from '#services/gateway_pagamento'
import { garantirPerfilAutorizado, garantirTransicaoPermitida } from '#services/transicao_de_status'

function pagamentoEmAndamento() {
  return new ApiException(
    'O pagamento deste pedido ainda esta em andamento. Aguarde o resultado para cancelar.',
    { code: 'PAGAMENTO_EM_ANDAMENTO', status: 409 }
  )
}

@inject()
export default class CancelamentoService {
  constructor(private gateway: GatewayPagamento) {}

  async cancelar(usuario: User, pedidoId: number, motivo: string) {
    const { pedido, pagamento } = await this.cancelavel(usuario, pedidoId)
    const estorno = pagamento?.aprovado ? await this.estornar(pedido, pagamento) : null

    const cancelado = await db.transaction(async (trx) => {
      const travado = await this.cancelavel(usuario, pedidoId, trx)

      if (travado.pagamento?.aprovado) {
        if (!estorno) {
          throw pagamentoEmAndamento()
        }

        await this.registrarEstorno(travado.pagamento, estorno, usuario, trx)
      }

      await this.registrarCancelamento(
        travado.pedido,
        { usuario, motivo, estornado: estorno !== null },
        trx
      )

      return travado.pedido
    })

    await cancelado.load('itens', (itens) => itens.orderBy('id'))
    await cancelado.load('pagamento')

    return cancelado
  }

  private async cancelavel(usuario: User, pedidoId: number, trx?: TransactionClientContract) {
    const encontrado = await Pedido.query({ client: trx })
      .where('id', pedidoId)
      .if(trx, (query) => query.forUpdate())
      .first()
    const pedido = garantirPedidoVisivel(encontrado, usuario, pedidoId)

    garantirTransicaoPermitida(pedido, 'CANCELADO')
    garantirPerfilAutorizado(pedido, usuario, 'CANCELADO')

    const pagamento = await Pagamento.query({ client: trx })
      .where('pedidoId', pedido.id)
      .if(trx, (query) => query.forUpdate())
      .first()

    if (pagamento?.pendente) {
      throw pagamentoEmAndamento()
    }

    return { pedido, pagamento }
  }

  private estornar(pedido: Pedido, pagamento: Pagamento) {
    return this.gateway.estornar(`estorno-${pedido.id}`, pagamento.referenciaExterna!)
  }

  private async registrarEstorno(
    pagamento: Pagamento,
    { resposta, estorno }: RespostaDoEstorno,
    usuario: User,
    trx: TransactionClientContract
  ) {
    const estornadoEm = DateTime.fromISO(estorno.estornadoEm)

    pagamento.merge({
      status: 'ESTORNADO',
      estornadoEm: estornadoEm.isValid ? estornadoEm : DateTime.now(),
      payloadEstorno: resposta,
    })

    await pagamento.save()

    await registrarAuditoria(
      {
        acao: 'pagamento.estornado',
        entidade: 'pagamento',
        entidadeId: pagamento.id,
        usuario,
        dados: { pedidoId: pagamento.pedidoId },
      },
      trx
    )
  }

  private async registrarCancelamento(
    pedido: Pedido,
    { usuario, motivo, estornado }: { usuario: User; motivo: string; estornado: boolean },
    trx: TransactionClientContract
  ) {
    const origem = pedido.status
    const estoqueDevolvido = pedido.devolveEstoqueAoCancelar

    if (estoqueDevolvido) {
      await Estoque.devolverItensDe(
        pedido,
        { usuarioId: usuario.id, motivo: `Cancelamento do pedido ${pedido.codigo}` },
        trx
      )
    }

    pedido.merge({ status: 'CANCELADO', canceladoEm: DateTime.now(), motivoCancelamento: motivo })
    await pedido.save()

    await registrarAuditoria(
      {
        acao: 'pedido.cancelado',
        entidade: 'pedido',
        entidadeId: pedido.id,
        usuario,
        dados: { de: origem, motivo, estornado, estoqueDevolvido },
      },
      trx
    )
  }
}
