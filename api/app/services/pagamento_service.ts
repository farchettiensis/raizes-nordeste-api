import { inject } from '@adonisjs/core'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { Infer } from '@vinejs/vine/types'
import { DateTime } from 'luxon'

import ApiException from '#exceptions/api_exception'
import Estoque from '#models/estoque'
import MovimentacaoEstoque from '#models/movimentacao_estoque'
import Pagamento, { type MetodoPagamentoExterno } from '#models/pagamento'
import Pedido, { type StatusPedido } from '#models/pedido'
import PedidoItem from '#models/pedido_item'
import type User from '#models/user'
import { emCentavos } from '#services/centavos'
import { GatewayPagamento } from '#services/gateway_pagamento'
import { garantirPedidoDoCliente } from '#services/pedido_service'
import type { eventoDePagamentoValidator } from '#validators/pagamento'

export type EventoDePagamento = Infer<typeof eventoDePagamentoValidator>

type Resultado = {
  evento: EventoDePagamento
  payload: Record<string, unknown>
  trx: TransactionClientContract
}

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

  async processarResultado(evento: EventoDePagamento, payload: Record<string, unknown>) {
    await db.transaction(async (trx) => {
      const { pedido, pagamento } = await this.travarPagamento(evento, trx)

      if (!pagamento.pendente) {
        logger.info({ eventoId: evento.id, pagamentoId: pagamento.id }, 'Webhook repetido ignorado')
        return
      }

      this.conferir(pagamento, evento)

      if (evento.pagamento.status === 'APROVADO') {
        await this.aprovar(pedido, pagamento, { evento, payload, trx })
      } else {
        await this.recusar(pedido, pagamento, { evento, payload, trx })
      }
    })
  }

  private async travarPagamento(evento: EventoDePagamento, trx: TransactionClientContract) {
    const pagamentoId = Number(evento.pagamento.referencia)
    const encontrado = await Pagamento.find(pagamentoId, { client: trx })

    if (!encontrado) {
      throw new ApiException('O pagamento informado pelo provedor nao existe.', {
        code: 'PAGAMENTO_NAO_ENCONTRADO',
        status: 404,
        details: [
          { field: 'pagamento.referencia', issue: `Pagamento ${pagamentoId} nao encontrado` },
        ],
      })
    }

    const pedido = await Pedido.query({ client: trx })
      .where('id', encontrado.pedidoId)
      .forUpdate()
      .firstOrFail()
    const pagamento = await Pagamento.query({ client: trx })
      .where('id', pagamentoId)
      .forUpdate()
      .firstOrFail()

    return { pedido, pagamento }
  }

  private conferir(pagamento: Pagamento, evento: EventoDePagamento) {
    const divergencias = [
      emCentavos(pagamento.valor) !== evento.pagamento.valor && {
        field: 'pagamento.valor',
        issue: `Esperado: ${emCentavos(pagamento.valor)}`,
      },
      pagamento.referenciaExterna !== null &&
        pagamento.referenciaExterna !== evento.pagamento.id && {
          field: 'pagamento.id',
          issue: `Esperado: ${pagamento.referenciaExterna}`,
        },
    ].filter((divergencia) => divergencia !== false)

    if (divergencias.length > 0) {
      throw new ApiException('O resultado nao corresponde ao pagamento registrado.', {
        code: 'PAGAMENTO_DIVERGENTE',
        status: 409,
        details: divergencias,
      })
    }
  }

  private async aprovar(pedido: Pedido, pagamento: Pagamento, resultado: Resultado) {
    await this.registrarResultado(pagamento, resultado)
    await this.transicionar(pedido, 'PAGO')
  }

  private async recusar(pedido: Pedido, pagamento: Pagamento, resultado: Resultado) {
    await this.registrarResultado(pagamento, resultado)
    pedido.canceladoEm = DateTime.now()
    await this.transicionar(pedido, 'CANCELADO')
    await this.devolverEstoque(pedido, resultado.trx)
  }

  private async registrarResultado(pagamento: Pagamento, { evento, payload }: Resultado) {
    const processadoEm = DateTime.fromISO(evento.pagamento.processadoEm)

    pagamento.merge({
      status: evento.pagamento.status,
      motivoRecusa: evento.pagamento.status === 'RECUSADO' ? evento.pagamento.motivoRecusa : null,
      referenciaExterna: evento.pagamento.id,
      processadoEm: processadoEm.isValid ? processadoEm : DateTime.now(),
      payloadWebhook: payload,
    })

    await pagamento.save()
  }

  private async transicionar(pedido: Pedido, destino: StatusPedido) {
    if (!pedido.podeTransicionarPara(destino)) {
      throw new ApiException('O pedido nao pode receber este resultado de pagamento.', {
        code: 'TRANSICAO_DE_STATUS_INVALIDA',
        status: 409,
        details: [{ field: 'status', issue: `${pedido.status} para ${destino}` }],
      })
    }

    pedido.status = destino
    await pedido.save()
  }

  private async devolverEstoque(pedido: Pedido, trx: TransactionClientContract) {
    const itens = await PedidoItem.query({ client: trx }).where('pedidoId', pedido.id)
    const estoques = await Estoque.travarDaUnidade(
      pedido.unidadeId,
      itens.map((item) => item.produtoId),
      trx
    )
    const porProduto = new Map(estoques.map((estoque) => [estoque.produtoId, estoque]))

    for (const item of itens) {
      const estoque = porProduto.get(item.produtoId)!
      estoque.quantidade += item.quantidade
      await estoque.save()

      await MovimentacaoEstoque.create(
        {
          estoqueId: estoque.id,
          pedidoId: pedido.id,
          usuarioId: null,
          tipo: 'ENTRADA',
          quantidade: item.quantidade,
          saldoResultante: estoque.quantidade,
          motivo: `Pagamento recusado do pedido ${pedido.codigo}`,
        },
        { client: trx }
      )
    }
  }
}
