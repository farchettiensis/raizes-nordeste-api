import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'fidelidade_movimentos'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('conta_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('fidelidade_contas')
        .onDelete('CASCADE')
      table
        .integer('pedido_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('pedidos')
        .onDelete('SET NULL')
      table.string('tipo', 20).notNullable()
      table.integer('pontos').notNullable()
      table.integer('saldo_resultante').notNullable()
      table.string('descricao').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.index(['conta_id', 'created_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
