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
    'profile.profile.show': { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'docs.index': { paramsTuple?: []; params?: {} }
    'docs.spec': { paramsTuple?: []; params?: {} }
    'docs.asset': { paramsTuple: [ParamValue]; params: {'file': ParamValue} }
    'unidades.unidades.index': { paramsTuple?: []; params?: {} }
    'unidades.unidades.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'unidades.cardapios.index': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'profile.profile.show': { paramsTuple?: []; params?: {} }
  }
  POST: {
    'auth.new_account.store': { paramsTuple?: []; params?: {} }
    'auth.access_tokens.store': { paramsTuple?: []; params?: {} }
    'profile.access_tokens.destroy': { paramsTuple?: []; params?: {} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}