import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'movimentacoes_estoque'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('estoque_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('estoques')
        .onDelete('CASCADE')
      table
        .integer('pedido_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('pedidos')
        .onDelete('SET NULL')
      table
        .integer('usuario_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.string('tipo', 20).notNullable()
      table.integer('quantidade').notNullable()
      table.integer('saldo_resultante').notNullable()
      table.string('motivo').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.index(['estoque_id', 'created_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
