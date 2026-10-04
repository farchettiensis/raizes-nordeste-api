import { inject } from '@adonisjs/core'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

import ApiException from '#exceptions/api_exception'
import Pagamento, { type MetodoPagamentoExterno } from '#models/pagamento'
import Pedido from '#models/pedido'
import type User from '#models/user'
import { emCentavos } from '#services/centavos'
import { GatewayPagamento } from '#services/gateway_pagamento'
import { garantirPedidoDoCliente } from '#services/pedido_service'

@inject()
export default class PagamentoService {
  constructor(private gateway: GatewayPagamento) {}

  async solicitar(cliente: User, pedidoId: number, metodo: MetodoPagamentoExterno) {
    const { pedido, pagamento } = await db.transaction(async (trx) => {
      const travado = await this.travarPedido(cliente, pedidoId, trx)
      this.exigirAguardandoPagamento(travado)

      return { pedido: travado, pagamento: await this.pagamentoDo(travado, metodo, trx) }
    })

    if (!pagamento.referenciaExterna) {
      await this.enviarAoGateway(pedido, pagamento)
    }

    return pagamento
  }

  private async travarPedido(cliente: User, pedidoId: number, trx: TransactionClientContract) {
    const pedido = await Pedido.query({ client: trx }).where('id', pedidoId).forUpdate().first()

    return garantirPedidoDoCliente(pedido, cliente, pedidoId)
  }

  private exigirAguardandoPagamento(pedido: Pedido) {
    if (!pedido.podeTransicionarPara('PAGO')) {
      throw new ApiException('O pedido nao esta aguardando pagamento.', {
        code: 'PEDIDO_NAO_AGUARDA_PAGAMENTO',
        status: 409,
        details: [{ field: 'status', issue: `Status atual: ${pedido.status}` }],
      })
    }
  }

  private async pagamentoDo(
    pedido: Pedido,
    metodo: MetodoPagamentoExterno,
    trx: TransactionClientContract
  ) {
    const existente = await Pagamento.query({ client: trx }).where('pedidoId', pedido.id).first()

    if (!existente) {
      return Pagamento.create(
        { pedidoId: pedido.id, metodo, valor: pedido.total, status: 'PENDENTE' },
        { client: trx }
      )
    }

    if (existente.metodo !== metodo) {
      throw new ApiException('Ja existe um pagamento em andamento para este pedido.', {
        code: 'PAGAMENTO_EM_ANDAMENTO',
        status: 409,
        details: [{ field: 'metodo', issue: `Pagamento em andamento com ${existente.metodo}` }],
      })
    }

    return existente
  }

  private async enviarAoGateway(pedido: Pedido, pagamento: Pagamento) {
    const {
      requisicao,
      resposta,
      pagamento: noGateway,
    } = await this.gateway.solicitar(`pagamento-${pagamento.id}`, {
      referencia: String(pagamento.id),
      valorEmCentavos: emCentavos(pagamento.valor),
      metodo: pagamento.metodo as MetodoPagamentoExterno,
      descricao: `Pedido ${pedido.codigo}`,
    })

    pagamento.merge({
      referenciaExterna: noGateway.id,
      payloadRequisicao: requisicao,
      payloadResposta: resposta,
    })

    await pagamento.save()
  }
}
