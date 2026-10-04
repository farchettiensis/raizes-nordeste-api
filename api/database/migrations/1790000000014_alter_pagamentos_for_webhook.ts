import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pagamentos'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.unique(['pedido_id'])
      table.jsonb('payload_webhook').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(['pedido_id'])
      table.dropColumn('payload_webhook')
    })
  }
}
