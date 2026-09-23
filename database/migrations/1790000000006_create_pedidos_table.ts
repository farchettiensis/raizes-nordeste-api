import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pedidos'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('codigo', 20).notNullable().unique()
      table
        .integer('unidade_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('unidades')
        .onDelete('RESTRICT')
      table
        .integer('cliente_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('RESTRICT')
      table.string('canal_pedido', 20).notNullable()
      table.string('status', 30).notNullable().defaultTo('AGUARDANDO_PAGAMENTO')
      table.decimal('subtotal', 10, 2).notNullable().defaultTo(0)
      table.decimal('desconto', 10, 2).notNullable().defaultTo(0)
      table.decimal('total', 10, 2).notNullable().defaultTo(0)
      table.integer('pontos_gerados').notNullable().defaultTo(0)
      table.text('observacoes').nullable()
      table.timestamp('cancelado_em').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.index(['unidade_id', 'status'])
      table.index(['canal_pedido'])
      table.index(['cliente_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
