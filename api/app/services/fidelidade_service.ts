import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'

import ApiException from '#exceptions/api_exception'
import FidelidadeConta from '#models/fidelidade_conta'
import FidelidadeMovimento from '#models/fidelidade_movimento'
import type Pedido from '#models/pedido'
import User from '#models/user'
import { registrarAuditoria } from '#services/auditoria'
import { emCentavos } from '#services/centavos'

export type ProgramaDoCliente = {
  ativa: boolean
  conta: FidelidadeConta | null
}

function travarCliente(cliente: User, trx: TransactionClientContract) {
  return User.query({ client: trx }).where('id', cliente.id).forUpdate().firstOrFail()
}

function fidelidadeInativa() {
  return new ApiException('O cliente nao participa do programa de fidelidade.', {
    code: 'FIDELIDADE_INATIVA',
    status: 409,
  })
}

export async function resgatarPontos(
  cliente: User,
  pontos: number,
  subtotalEmCentavos: number,
  trx: TransactionClientContract
) {
  const conta = await FidelidadeConta.ativaTravadaDo(cliente.id, trx)

  if (!conta) {
    throw fidelidadeInativa()
  }

  if (!conta.podeResgatar(pontos)) {
    throw new ApiException('O saldo de pontos nao cobre o resgate.', {
      code: 'SALDO_DE_PONTOS_INSUFICIENTE',
      status: 409,
      details: [{ field: 'pontosResgatados', issue: `Saldo: ${conta.saldoPontos}` }],
    })
  }

  const maximo = FidelidadeConta.maximoDePontosPara(subtotalEmCentavos)

  if (pontos > maximo) {
    throw new ApiException('O desconto passa do limite permitido para o pedido.', {
      code: 'DESCONTO_ACIMA_DO_LIMITE',
      status: 409,
      details: [{ field: 'pontosResgatados', issue: `Maximo: ${maximo} pontos` }],
    })
  }

  return conta
}

export async function creditarPontosDaEntrega(pedido: Pedido, trx: TransactionClientContract) {
  const conta = pedido.clienteId
    ? await FidelidadeConta.ativaTravadaDo(pedido.clienteId, trx)
    : null
  const pontos = FidelidadeConta.pontosDaCompra(emCentavos(pedido.total))

  if (!conta || pontos === 0) {
    return
  }

  await conta.lancar({
    tipo: 'ACUMULO',
    pontos,
    pedidoId: pedido.id,
    descricao: `Pedido ${pedido.codigo} entregue`,
  })

  pedido.pontosGerados = pontos
  await pedido.save()
}

export async function devolverPontosResgatados(pedido: Pedido, trx: TransactionClientContract) {
  const resgate = await FidelidadeMovimento.query({ client: trx })
    .where('pedidoId', pedido.id)
    .where('tipo', 'RESGATE')
    .first()
  const conta =
    resgate && pedido.clienteId ? await FidelidadeConta.ativaTravadaDo(pedido.clienteId, trx) : null

  if (!resgate || !conta) {
    return
  }

  await conta.lancar({
    tipo: 'ESTORNO',
    pontos: -resgate.pontos,
    pedidoId: pedido.id,
    descricao: `Cancelamento do pedido ${pedido.codigo}`,
  })
}

export default class FidelidadeService {
  async programaDo(cliente: User): Promise<ProgramaDoCliente> {
    const conta = await FidelidadeConta.findBy('clienteId', cliente.id)

    return { ativa: cliente.consentiuFidelidade && conta !== null, conta }
  }

  extratoDo(cliente: User, page: number, limit: number) {
    return FidelidadeMovimento.query()
      .whereHas('conta', (conta) => conta.where('clienteId', cliente.id))
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .paginate(page, limit)
  }

  async aderir(cliente: User): Promise<ProgramaDoCliente> {
    const conta = await db.transaction(async (trx) => {
      const travado = await travarCliente(cliente, trx)

      if (travado.consentiuFidelidade) {
        throw new ApiException('O cliente ja participa do programa de fidelidade.', {
          code: 'FIDELIDADE_JA_ATIVA',
          status: 409,
        })
      }

      const agora = DateTime.now()
      travado.consentimentoFidelidadeEm = agora
      await travado.save()

      const aderida = await FidelidadeConta.updateOrCreate(
        { clienteId: cliente.id },
        { aderiuEm: agora, saldoPontos: 0 },
        { client: trx }
      )

      await registrarAuditoria(
        {
          acao: 'fidelidade.aderida',
          entidade: 'fidelidade',
          entidadeId: aderida.id,
          usuario: travado,
        },
        trx
      )

      return aderida
    })

    return { ativa: true, conta }
  }

  async revogar(cliente: User) {
    await db.transaction(async (trx) => {
      const travado = await travarCliente(cliente, trx)
      const conta = await FidelidadeConta.ativaTravadaDo(cliente.id, trx)

      if (!conta) {
        throw fidelidadeInativa()
      }

      const pontosPerdidos = conta.saldoPontos

      if (pontosPerdidos > 0) {
        await conta.lancar({
          tipo: 'EXPIRACAO',
          pontos: -pontosPerdidos,
          descricao: 'Revogacao do consentimento',
        })
      }

      travado.consentimentoFidelidadeEm = null
      await travado.save()

      await registrarAuditoria(
        {
          acao: 'fidelidade.revogada',
          entidade: 'fidelidade',
          entidadeId: conta.id,
          usuario: travado,
          dados: { pontosPerdidos },
        },
        trx
      )
    })
  }
}
