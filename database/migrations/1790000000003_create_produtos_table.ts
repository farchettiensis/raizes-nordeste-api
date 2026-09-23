import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'produtos'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('codigo', 20).notNullable().unique()
      table.string('nome').notNullable()
      table.text('descricao').nullable()
      table.string('categoria', 60).notNullable()
      table.decimal('preco_base', 10, 2).notNullable()
      table.boolean('sazonal').notNullable().defaultTo(false)
      table.boolean('ativo').notNullable().defaultTo(true)

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.index(['categoria'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
