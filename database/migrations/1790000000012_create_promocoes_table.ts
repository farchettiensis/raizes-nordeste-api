import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'promocoes'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('unidade_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('unidades')
        .onDelete('CASCADE')
      table.string('codigo', 30).notNullable().unique()
      table.string('nome').notNullable()
      table.string('tipo', 20).notNullable()
      table.decimal('valor', 10, 2).notNullable()
      table.string('canal_pedido', 20).nullable()
      table.decimal('valor_minimo_pedido', 10, 2).notNullable().defaultTo(0)
      table.timestamp('inicia_em').notNullable()
      table.timestamp('termina_em').notNullable()
      table.boolean('ativa').notNullable().defaultTo(true)

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.index(['ativa', 'inicia_em', 'termina_em'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
