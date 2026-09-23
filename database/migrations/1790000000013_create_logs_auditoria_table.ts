import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'logs_auditoria'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('usuario_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.string('acao', 80).notNullable()
      table.string('entidade', 60).notNullable()
      table.string('entidade_id', 40).nullable()
      table.jsonb('dados').nullable()
      table.string('ip', 45).nullable()
      table.string('request_id', 40).nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.index(['entidade', 'entidade_id'])
      table.index(['usuario_id', 'created_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
