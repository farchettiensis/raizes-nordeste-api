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
    estoque: {
      movimentacoes: {
        store: typeof routes['unidades.estoque.movimentacoes.store']
      }
    }
  }
  pedidos: {
    index: typeof routes['pedidos.index']
    store: typeof routes['pedidos.store']
    show: typeof routes['pedidos.show']
    status: {
      update: typeof routes['pedidos.status.update']
    }
    pagamento: {
      store: typeof routes['pedidos.pagamento.store']
    }
  }
  fidelidade: {
    show: typeof routes['fidelidade.show']
    movimentos: {
      index: typeof routes['fidelidade.movimentos.index']
    }
    adesao: {
      store: typeof routes['fidelidade.adesao.store']
      destroy: typeof routes['fidelidade.adesao.destroy']
    }
  }
  clientes: {
    conta: {
      destroy: typeof routes['clientes.conta.destroy']
    }
  }
  auditoria: {
    index: typeof routes['auditoria.index']
  }
  pagamentos: {
    webhook: typeof routes['pagamentos.webhook']
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
