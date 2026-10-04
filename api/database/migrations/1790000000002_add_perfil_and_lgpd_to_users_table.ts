import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('perfil', 20).notNullable().defaultTo('CLIENTE')
      table.string('telefone', 20).nullable()
      table.date('data_nascimento').nullable()
      table
        .integer('unidade_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('unidades')
        .onDelete('RESTRICT')
      table.timestamp('consentimento_dados_em').nullable()
      table.timestamp('consentimento_fidelidade_em').nullable()
      table.timestamp('consentimento_marketing_em').nullable()
      table.timestamp('anonimizado_em').nullable()

      table.index(['perfil'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('perfil')
      table.dropColumn('telefone')
      table.dropColumn('data_nascimento')
      table.dropColumn('unidade_id')
      table.dropColumn('consentimento_dados_em')
      table.dropColumn('consentimento_fidelidade_em')
      table.dropColumn('consentimento_marketing_em')
      table.dropColumn('anonimizado_em')
    })
  }
}
