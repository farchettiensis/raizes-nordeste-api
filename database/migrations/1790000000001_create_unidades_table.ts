import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'unidades'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('codigo', 20).notNullable().unique()
      table.string('nome').notNullable()
      table.string('formato', 20).notNullable().defaultTo('COMPLETA')
      table.string('cidade', 120).notNullable()
      table.string('estado', 2).notNullable()
      table.string('endereco').notNullable()
      table.string('telefone', 20).nullable()
      table.boolean('ativa').notNullable().defaultTo(true)

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.index(['estado', 'cidade'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
