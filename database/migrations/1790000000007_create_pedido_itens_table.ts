import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pedido_itens'

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
      table
        .integer('produto_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('produtos')
        .onDelete('RESTRICT')
      table.string('nome_produto').notNullable()
      table.integer('quantidade').notNullable()
      table.decimal('preco_unitario', 10, 2).notNullable()
      table.decimal('subtotal', 10, 2).notNullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.index(['pedido_id'])
      table.check('?? > 0', ['quantidade'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
