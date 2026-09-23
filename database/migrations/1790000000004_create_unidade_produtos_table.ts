import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'unidade_produtos'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('unidade_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('unidades')
        .onDelete('CASCADE')
      table
        .integer('produto_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('produtos')
        .onDelete('RESTRICT')
      table.decimal('preco', 10, 2).notNullable()
      table.boolean('disponivel').notNullable().defaultTo(true)

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['unidade_id', 'produto_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
