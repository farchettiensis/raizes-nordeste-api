import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'docs.index': { paramsTuple?: []; params?: {} }
    'docs.spec': { paramsTuple?: []; params?: {} }
    'docs.asset': { paramsTuple: [ParamValue]; params: {'file': ParamValue} }
    'auth.new_account.store': { paramsTuple?: []; params?: {} }
    'auth.access_tokens.store': { paramsTuple?: []; params?: {} }
    'unidades.unidades.index': { paramsTuple?: []; params?: {} }
    'unidades.unidades.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'unidades.cardapios.index': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'unidades.estoques.index': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'pedidos.index': { paramsTuple?: []; params?: {} }
    'pedidos.store': { paramsTuple?: []; params?: {} }
    'pedidos.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'pedidos.status.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'pedidos.pagamento.store': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'fidelidade.show': { paramsTuple?: []; params?: {} }
    'fidelidade.movimentos.index': { paramsTuple?: []; params?: {} }
    'fidelidade.adesao.store': { paramsTuple?: []; params?: {} }
    'fidelidade.adesao.destroy': { paramsTuple?: []; params?: {} }
    'clientes.conta.destroy': { paramsTuple?: []; params?: {} }
    'auditoria.index': { paramsTuple?: []; params?: {} }
    'pagamentos.webhook': { paramsTuple?: []; params?: {} }
    'profile.profile.show': { paramsTuple?: []; params?: {} }
    'profile.access_tokens.destroy': { paramsTuple?: []; params?: {} }
  }
  GET: {
    'docs.index': { paramsTuple?: []; params?: {} }
    'docs.spec': { paramsTuple?: []; params?: {} }
    'docs.asset': { paramsTuple: [ParamValue]; params: {'file': ParamValue} }
    'unidades.unidades.index': { paramsTuple?: []; params?: {} }
    'unidades.unidades.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'unidades.cardapios.index': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'unidades.estoques.index': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'pedidos.index': { paramsTuple?: []; params?: {} }
    'pedidos.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'fidelidade.show': { paramsTuple?: []; params?: {} }
    'fidelidade.movimentos.index': { paramsTuple?: []; params?: {} }
    'auditoria.index': { paramsTuple?: []; params?: {} }
    'profile.profile.show': { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'docs.index': { paramsTuple?: []; params?: {} }
    'docs.spec': { paramsTuple?: []; params?: {} }
    'docs.asset': { paramsTuple: [ParamValue]; params: {'file': ParamValue} }
    'unidades.unidades.index': { paramsTuple?: []; params?: {} }
    'unidades.unidades.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'unidades.cardapios.index': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'unidades.estoques.index': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'pedidos.index': { paramsTuple?: []; params?: {} }
    'pedidos.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'fidelidade.show': { paramsTuple?: []; params?: {} }
    'fidelidade.movimentos.index': { paramsTuple?: []; params?: {} }
    'auditoria.index': { paramsTuple?: []; params?: {} }
    'profile.profile.show': { paramsTuple?: []; params?: {} }
  }
  POST: {
    'auth.new_account.store': { paramsTuple?: []; params?: {} }
    'auth.access_tokens.store': { paramsTuple?: []; params?: {} }
    'pedidos.store': { paramsTuple?: []; params?: {} }
    'pedidos.pagamento.store': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'fidelidade.adesao.store': { paramsTuple?: []; params?: {} }
    'pagamentos.webhook': { paramsTuple?: []; params?: {} }
    'profile.access_tokens.destroy': { paramsTuple?: []; params?: {} }
  }
  PATCH: {
    'pedidos.status.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  DELETE: {
    'fidelidade.adesao.destroy': { paramsTuple?: []; params?: {} }
    'clientes.conta.destroy': { paramsTuple?: []; params?: {} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}