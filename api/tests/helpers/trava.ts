import { setTimeout as esperar } from 'node:timers/promises'
import db from '@adonisjs/lucid/services/db'

import Pedido from '#models/pedido'

export async function comPedidoTravado<T>(
  pedido: Pedido,
  disparar: () => Promise<T>,
  enquantoTravado: () => Promise<void>
) {
  const trava = await db.transaction()

  try {
    await Pedido.query({ client: trava }).where('id', pedido.id).forUpdate().firstOrFail()
    const emAndamento = disparar()
    await esperar(300)
    await enquantoTravado()
    await trava.commit()

    return await emAndamento
  } finally {
    if (!trava.isCompleted) {
      await trava.rollback()
    }
  }
}
