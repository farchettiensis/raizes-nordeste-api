import db from '@adonisjs/lucid/services/db'
import type { Infer } from '@vinejs/vine/types'

import ApiException from '#exceptions/api_exception'
import Estoque from '#models/estoque'
import MovimentacaoEstoque from '#models/movimentacao_estoque'
import { STATUS_COM_INSUMOS_INTACTOS } from '#models/pedido'
import type User from '#models/user'
import { registrarAuditoria } from '#services/auditoria'
import type { registrarMovimentacaoEstoqueValidator } from '#validators/movimentacao_estoque'

type DadosDaMovimentacao = Infer<typeof registrarMovimentacaoEstoqueValidator>

export default class MovimentacaoEstoqueService {
  async registrar(unidadeId: number, usuario: User, dados: DadosDaMovimentacao) {
    return db.transaction(async (trx) => {
      const estoque = await Estoque.query({ client: trx })
        .where('unidadeId', unidadeId)
        .where('produtoId', dados.produtoId)
        .forUpdate()
        .firstOrFail()
      const saldoAnterior = estoque.quantidade
      const saldoResultante = saldoAnterior + dados.quantidade

      if (saldoResultante < 0) {
        throw new ApiException('O ajuste excede o saldo de estoque disponivel.', {
          code: 'ESTOQUE_INSUFICIENTE',
          status: 409,
          details: [{ field: 'quantidade', issue: `Disponivel: ${saldoAnterior}` }],
        })
      }

      const reservas = await trx
        .from('pedido_itens')
        .join('pedidos', 'pedidos.id', 'pedido_itens.pedido_id')
        .where('pedidos.unidade_id', unidadeId)
        .where('pedido_itens.produto_id', dados.produtoId)
        .whereIn('pedidos.status', STATUS_COM_INSUMOS_INTACTOS)
        .sum('pedido_itens.quantidade as quantidade')
        .first()
      const quantidadeReservada = Number(reservas?.quantidade ?? 0)

      if (saldoResultante + quantidadeReservada > 2147483647) {
        throw new ApiException('O saldo de estoque e as reservas excedem o limite permitido.', {
          code: 'SALDO_ESTOQUE_ACIMA_DO_LIMITE',
          status: 409,
        })
      }

      estoque.quantidade = saldoResultante
      await estoque.save()

      const movimento = await MovimentacaoEstoque.create(
        {
          estoqueId: estoque.id,
          usuarioId: usuario.id,
          pedidoId: null,
          tipo: dados.tipo,
          quantidade: dados.quantidade,
          saldoResultante,
          motivo: dados.motivo,
        },
        { client: trx }
      )

      await registrarAuditoria(
        {
          acao: 'estoque.movimentado',
          entidade: 'estoque',
          entidadeId: estoque.id,
          usuario,
          dados: {
            movimentoId: movimento.id,
            unidadeId,
            produtoId: dados.produtoId,
            tipo: dados.tipo,
            quantidade: dados.quantidade,
            saldoAnterior,
            saldoResultante,
            motivo: dados.motivo,
          },
        },
        trx
      )

      return movimento
    })
  }
}
