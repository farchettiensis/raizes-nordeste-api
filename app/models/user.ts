import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo, hasMany, hasOne } from '@adonisjs/lucid/orm'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import type { BelongsTo, HasMany, HasOne } from '@adonisjs/lucid/types/relations'
import { type AccessToken, DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'

import { UserSchema } from '#database/schema'
import FidelidadeConta from '#models/fidelidade_conta'
import Pedido from '#models/pedido'
import Unidade from '#models/unidade'

export const PERFIS_USUARIO = ['CLIENTE', 'ATENDENTE', 'COZINHA', 'GERENTE', 'ADMIN'] as const

export type PerfilUsuario = (typeof PERFIS_USUARIO)[number]

export const PERFIS_DA_UNIDADE: PerfilUsuario[] = ['ATENDENTE', 'COZINHA', 'GERENTE']

export default class User extends compose(UserSchema, withAuthFinder(hash)) {
  static table = 'users'
  static accessTokens = DbAccessTokensProvider.forModel(User)

  declare currentAccessToken?: AccessToken

  @belongsTo(() => Unidade)
  declare unidade: BelongsTo<typeof Unidade>

  @hasMany(() => Pedido, { foreignKey: 'clienteId' })
  declare pedidos: HasMany<typeof Pedido>

  @hasOne(() => FidelidadeConta, { foreignKey: 'clienteId' })
  declare fidelidade: HasOne<typeof FidelidadeConta>

  get initials() {
    const [first, last] = this.fullName ? this.fullName.split(' ') : this.email.split('@')
    if (first && last) {
      return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
    }
    return `${first.slice(0, 2)}`.toUpperCase()
  }

  get vinculadoAUnidade() {
    return PERFIS_DA_UNIDADE.includes(this.perfil)
  }

  get consentiuFidelidade() {
    return this.consentimentoFidelidadeEm !== null
  }

  temPerfil(...perfis: PerfilUsuario[]) {
    return perfis.includes(this.perfil)
  }
}
