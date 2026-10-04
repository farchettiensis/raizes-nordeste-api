import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'estoques'

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
      table.integer('quantidade').notNullable().defaultTo(0)
      table.integer('quantidade_minima').notNullable().defaultTo(0)

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.unique(['unidade_id', 'produto_id'])
      table.check('?? >= 0', ['quantidade'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
