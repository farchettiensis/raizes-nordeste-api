import { setTimeout as esperar } from 'node:timers/promises'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

import FidelidadeConta from '#models/fidelidade_conta'
import Pedido from '#models/pedido'

async function comTrava<T>(
  travar: (trava: TransactionClientContract) => Promise<unknown>,
  disparar: () => Promise<T>,
  enquantoTravado: (trava: TransactionClientContract) => Promise<void>
) {
  const trava = await db.transaction()

  try {
    await travar(trava)
    const emAndamento = disparar()
    await esperar(300)
    await enquantoTravado(trava)
    await trava.commit()

    return await emAndamento
  } finally {
    if (!trava.isCompleted) {
      await trava.rollback()
    }
  }
}

export function comPedidoTravado<T>(
  pedido: Pedido,
  disparar: () => Promise<T>,
  enquantoTravado: (trava: TransactionClientContract) => Promise<void>
) {
  return comTrava(
    (trava) => Pedido.query({ client: trava }).where('id', pedido.id).forUpdate().firstOrFail(),
    disparar,
    enquantoTravado
  )
}

export function comContaTravada<T>(
  conta: FidelidadeConta,
  disparar: () => Promise<T>,
  enquantoTravado: (trava: TransactionClientContract) => Promise<void>
) {
  return comTrava(
    (trava) =>
      FidelidadeConta.query({ client: trava }).where('id', conta.id).forUpdate().firstOrFail(),
    disparar,
    enquantoTravado
  )
}
