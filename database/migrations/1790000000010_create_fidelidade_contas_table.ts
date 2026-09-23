import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'fidelidade_contas'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('cliente_id')
        .unsigned()
        .notNullable()
        .unique()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.integer('saldo_pontos').notNullable().defaultTo(0)
      table.timestamp('aderiu_em').notNullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.check('?? >= 0', ['saldo_pontos'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
