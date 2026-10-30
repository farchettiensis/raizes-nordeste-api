import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('pedidos', (table) => {
      table.string('motivo_cancelamento', 255).nullable()
    })

    this.schema.alterTable('pagamentos', (table) => {
      table.timestamp('estornado_em').nullable()
      table.jsonb('payload_estorno').nullable()
    })
  }

  async down() {
    this.schema.alterTable('pagamentos', (table) => {
      table.dropColumn('estornado_em')
      table.dropColumn('payload_estorno')
    })

    this.schema.alterTable('pedidos', (table) => {
      table.dropColumn('motivo_cancelamento')
    })
  }
}
