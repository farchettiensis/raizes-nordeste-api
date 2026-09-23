import { type SchemaRules } from '@adonisjs/lucid/types/schema_generator'

function enumColumn(tsType: string, source: string) {
  return {
    tsType,
    imports: [{ source, typeImports: [tsType] }],
    decorators: [{ name: '@column' }],
  }
}

export default {
  tables: {
    users: {
      columns: {
        perfil: enumColumn('PerfilUsuario', '#models/user'),
      },
    },
    unidades: {
      columns: {
        formato: enumColumn('FormatoUnidade', '#models/unidade'),
      },
    },
    pedidos: {
      columns: {
        canal_pedido: enumColumn('CanalPedido', '#models/pedido'),
        status: enumColumn('StatusPedido', '#models/pedido'),
      },
    },
    pagamentos: {
      columns: {
        status: enumColumn('StatusPagamento', '#models/pagamento'),
        metodo: enumColumn('MetodoPagamento', '#models/pagamento'),
      },
    },
    movimentacoes_estoque: {
      columns: {
        tipo: enumColumn('TipoMovimentacaoEstoque', '#models/movimentacao_estoque'),
      },
    },
    fidelidade_movimentos: {
      columns: {
        tipo: enumColumn('TipoMovimentoFidelidade', '#models/fidelidade_movimento'),
      },
    },
    promocoes: {
      columns: {
        tipo: enumColumn('TipoPromocao', '#models/promocao'),
        canal_pedido: enumColumn('CanalPedido', '#models/pedido'),
      },
    },
  },
} satisfies SchemaRules
