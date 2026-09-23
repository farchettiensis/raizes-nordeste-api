import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pagamentos'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('pedido_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('pedidos')
        .onDelete('CASCADE')
      table.string('status', 20).notNullable().defaultTo('PENDENTE')
      table.string('metodo', 20).notNullable()
      table.decimal('valor', 10, 2).notNullable()
      table.string('referencia_externa', 80).nullable().unique()
      table.string('motivo_recusa').nullable()
      table.jsonb('payload_requisicao').nullable()
      table.jsonb('payload_resposta').nullable()
      table.timestamp('processado_em').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.index(['pedido_id', 'status'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
