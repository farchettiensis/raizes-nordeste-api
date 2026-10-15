import ApiException from '#exceptions/api_exception'
import type Pedido from '#models/pedido'
import type User from '#models/user'

function semPermissao(message: string) {
  return new ApiException(message, { code: 'SEM_PERMISSAO', status: 403 })
}

export function garantirUnidadeVinculada(usuario: User) {
  if (usuario.semUnidadeVinculada) {
    throw new ApiException('Seu usuario nao esta vinculado a nenhuma unidade.', {
      code: 'SEM_UNIDADE_VINCULADA',
      status: 403,
    })
  }
}

export function garantirAcessoAUnidade(usuario: User, unidadeId: number) {
  garantirUnidadeVinculada(usuario)

  if (!usuario.operaUnidade(unidadeId)) {
    throw semPermissao('Esta unidade nao e a sua.')
  }
}

export function garantirPedidoVisivel(pedido: Pedido | null, usuario: User, pedidoId: number) {
  if (!pedido) {
    throw new ApiException('O pedido informado nao existe.', {
      code: 'PEDIDO_NAO_ENCONTRADO',
      status: 404,
      details: [{ field: 'id', issue: `Pedido ${pedidoId} nao encontrado` }],
    })
  }

  garantirUnidadeVinculada(usuario)

  if (!pedido.visivelPara(usuario)) {
    throw semPermissao('Voce nao tem acesso a este pedido.')
  }

  return pedido
}
