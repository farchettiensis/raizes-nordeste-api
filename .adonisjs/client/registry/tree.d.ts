/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  docs: {
    index: typeof routes['docs.index']
    spec: typeof routes['docs.spec']
    asset: typeof routes['docs.asset']
  }
  auth: {
    newAccount: {
      store: typeof routes['auth.new_account.store']
    }
    accessTokens: {
      store: typeof routes['auth.access_tokens.store']
    }
  }
  unidades: {
    unidades: {
      index: typeof routes['unidades.unidades.index']
      show: typeof routes['unidades.unidades.show']
    }
    cardapios: {
      index: typeof routes['unidades.cardapios.index']
    }
    estoques: {
      index: typeof routes['unidades.estoques.index']
    }
  }
  profile: {
    profile: {
      show: typeof routes['profile.profile.show']
    }
    accessTokens: {
      destroy: typeof routes['profile.access_tokens.destroy']
    }
  }
}
