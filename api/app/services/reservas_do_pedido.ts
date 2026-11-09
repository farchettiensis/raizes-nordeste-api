import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

import Estoque, { type Devolucao } from '#models/estoque'
import type Pedido from '#models/pedido'
import { devolverPontosResgatados } from '#services/fidelidade_service'

export async function devolverReservasDo(
  pedido: Pedido,
  devolucao: Devolucao,
  trx: TransactionClientContract
) {
  const estoqueDevolvido = pedido.devolveEstoqueAoCancelar

  if (estoqueDevolvido) {
    await Estoque.devolverItensDe(pedido, devolucao, trx)
  }

  await devolverPontosResgatados(pedido, trx)

  return { estoqueDevolvido }
}
