import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

import ApiException from '#exceptions/api_exception'
import {
  STATUS_DEFINIDOS_PELA_OPERACAO,
  TRANSICOES_STATUS_PEDIDO,
  type default as Pedido,
  type StatusPedido,
} from '#models/pedido'
import type User from '#models/user'
import { registrarAuditoria } from '#services/auditoria'

function destinosPossiveis(pedido: Pedido) {
  if (pedido.finalizado) {
    return `De ${pedido.status} o pedido nao muda mais de status`
  }

  const destinos = TRANSICOES_STATUS_PEDIDO[pedido.status].filter((status) =>
    STATUS_DEFINIDOS_PELA_OPERACAO.some((definido) => definido === status)
  )

  return `De ${pedido.status} o pedido so pode ir para: ${destinos.join(', ')}`
}

export function garantirTransicaoPermitida(pedido: Pedido, destino: StatusPedido) {
  if (!pedido.podeTransicionarPara(destino)) {
    throw new ApiException('O pedido nao pode ir do status atual para o solicitado.', {
      code: 'TRANSICAO_DE_STATUS_INVALIDA',
      status: 409,
      details: [{ field: 'status', issue: destinosPossiveis(pedido) }],
    })
  }
}

export function garantirPerfilAutorizado(pedido: Pedido, usuario: User, destino: StatusPedido) {
  if (!pedido.podeSerTransicionadoPor(usuario, destino)) {
    throw new ApiException('Seu perfil nao pode levar o pedido a este status.', {
      code: 'SEM_PERMISSAO',
      status: 403,
      details: [{ field: 'status', issue: `${pedido.status} para ${destino}` }],
    })
  }
}

export async function aplicarTransicao(
  pedido: Pedido,
  destino: StatusPedido,
  usuario: User | null,
  trx: TransactionClientContract
) {
  const origem = pedido.status
  pedido.status = destino
  await pedido.save()

  await registrarAuditoria(
    {
      acao: 'pedido.status_alterado',
      entidade: 'pedido',
      entidadeId: pedido.id,
      usuario,
      dados: { de: origem, para: destino },
    },
    trx
  )
}
