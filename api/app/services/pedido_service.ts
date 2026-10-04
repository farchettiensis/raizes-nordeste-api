import { randomBytes } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'

import ApiException, { type ErrorDetail } from '#exceptions/api_exception'
import Estoque from '#models/estoque'
import MovimentacaoEstoque from '#models/movimentacao_estoque'
import Pedido, { type CanalPedido } from '#models/pedido'
import Unidade from '#models/unidade'
import UnidadeProduto from '#models/unidade_produto'
import type User from '#models/user'
import { emCentavos, emReais } from '#services/centavos'

export type ItemSolicitado = {
  produtoId: number
  quantidade: number
}

export type NovoPedido = {
  unidadeId: number
  canalPedido: CanalPedido
  itens: ItemSolicitado[]
  observacoes?: string
}

export function garantirPedidoDoCliente(pedido: Pedido | null, cliente: User, pedidoId: number) {
  if (!pedido) {
    throw new ApiException('O pedido informado nao existe.', {
      code: 'PEDIDO_NAO_ENCONTRADO',
      status: 404,
      details: [{ field: 'id', issue: `Pedido ${pedidoId} nao encontrado` }],
    })
  }

  if (!pedido.pertenceA(cliente)) {
    throw new ApiException('Este pedido pertence a outro cliente.', {
      code: 'SEM_PERMISSAO',
      status: 403,
    })
  }

  return pedido
}

function gerarCodigo() {
  const data = DateTime.now().toFormat('yyMMdd')
  const sufixo = randomBytes(4).toString('hex').toUpperCase()

  return `PED${data}${sufixo}`
}

export default class PedidoService {
  async criar(cliente: User, dados: NovoPedido) {
    const pedido = await db.transaction(async (trx) => {
      const unidade = await this.unidadeAberta(dados.unidadeId, trx)
      const ofertas = await this.ofertasVendaveis(unidade, dados.itens, trx)
      const estoques = await this.reservarEstoque(unidade, dados.itens, trx)

      return this.registrar(cliente, dados, { ofertas, estoques }, trx)
    })

    await pedido.load('itens', (itens) => itens.orderBy('id'))

    return pedido
  }

  private async unidadeAberta(unidadeId: number, trx: TransactionClientContract) {
    const unidade = await Unidade.find(unidadeId, { client: trx })

    if (!unidade) {
      throw new ApiException('A unidade informada nao existe.', {
        code: 'UNIDADE_NAO_ENCONTRADA',
        status: 404,
        details: [{ field: 'unidadeId', issue: `Unidade ${unidadeId} nao encontrada` }],
      })
    }

    if (!unidade.ativa) {
      throw new ApiException('A unidade informada nao esta recebendo pedidos.', {
        code: 'UNIDADE_INATIVA',
        status: 409,
        details: [{ field: 'unidadeId', issue: `Unidade ${unidadeId} inativa` }],
      })
    }

    return unidade
  }

  private async ofertasVendaveis(
    unidade: Unidade,
    itens: ItemSolicitado[],
    trx: TransactionClientContract
  ) {
    const ofertas = await UnidadeProduto.query({ client: trx })
      .where('unidadeId', unidade.id)
      .whereIn(
        'produtoId',
        itens.map((item) => item.produtoId)
      )
      .preload('produto')

    const porProduto = new Map(ofertas.map((oferta) => [oferta.produtoId, oferta]))

    const foraDoCardapio = this.detalhesDosItens(itens, 'produtoId', (item) =>
      porProduto.has(item.produtoId)
        ? undefined
        : `Produto ${item.produtoId} fora do cardapio da unidade`
    )

    if (foraDoCardapio.length > 0) {
      throw new ApiException('Um ou mais produtos nao existem no cardapio da unidade.', {
        code: 'PRODUTO_NAO_ENCONTRADO',
        status: 404,
        details: foraDoCardapio,
      })
    }

    const indisponiveis = this.detalhesDosItens(itens, 'produtoId', (item) => {
      const oferta = porProduto.get(item.produtoId)!

      return oferta.disponivel && oferta.produto.ativo
        ? undefined
        : `Produto ${item.produtoId} indisponivel na unidade`
    })

    if (indisponiveis.length > 0) {
      throw new ApiException('Um ou mais produtos estao indisponiveis na unidade.', {
        code: 'PRODUTO_INDISPONIVEL',
        status: 409,
        details: indisponiveis,
      })
    }

    return porProduto
  }

  private async reservarEstoque(
    unidade: Unidade,
    itens: ItemSolicitado[],
    trx: TransactionClientContract
  ) {
    const estoques = await Estoque.travarDaUnidade(
      unidade.id,
      itens.map((item) => item.produtoId),
      trx
    )

    const porProduto = new Map(estoques.map((estoque) => [estoque.produtoId, estoque]))

    const insuficientes = this.detalhesDosItens(itens, 'quantidade', (item) => {
      const estoque = porProduto.get(item.produtoId)

      return estoque?.atende(item.quantidade)
        ? undefined
        : `Disponivel: ${estoque?.quantidade ?? 0}`
    })

    if (insuficientes.length > 0) {
      throw new ApiException('Nao ha quantidade suficiente para um ou mais itens.', {
        code: 'ESTOQUE_INSUFICIENTE',
        status: 409,
        details: insuficientes,
      })
    }

    return porProduto
  }

  private async registrar(
    cliente: User,
    dados: NovoPedido,
    { ofertas, estoques }: { ofertas: Map<number, UnidadeProduto>; estoques: Map<number, Estoque> },
    trx: TransactionClientContract
  ) {
    const itens = dados.itens.map((item) => {
      const oferta = ofertas.get(item.produtoId)!
      const precoEmCentavos = emCentavos(oferta.preco)

      return {
        produtoId: item.produtoId,
        nomeProduto: oferta.produto.nome,
        quantidade: item.quantidade,
        precoUnitario: emReais(precoEmCentavos),
        subtotalEmCentavos: precoEmCentavos * item.quantidade,
      }
    })

    const totalEmCentavos = itens.reduce((soma, item) => soma + item.subtotalEmCentavos, 0)

    const pedido = await Pedido.create(
      {
        codigo: gerarCodigo(),
        unidadeId: dados.unidadeId,
        clienteId: cliente.id,
        canalPedido: dados.canalPedido,
        status: 'AGUARDANDO_PAGAMENTO',
        subtotal: emReais(totalEmCentavos),
        desconto: emReais(0),
        total: emReais(totalEmCentavos),
        observacoes: dados.observacoes ?? null,
      },
      { client: trx }
    )

    await pedido.related('itens').createMany(
      itens.map(({ subtotalEmCentavos, ...item }) => ({
        ...item,
        subtotal: emReais(subtotalEmCentavos),
      }))
    )

    await this.baixarEstoque(pedido, cliente, dados.itens, estoques, trx)

    return pedido
  }

  private async baixarEstoque(
    pedido: Pedido,
    cliente: User,
    itens: ItemSolicitado[],
    estoques: Map<number, Estoque>,
    trx: TransactionClientContract
  ) {
    for (const item of itens) {
      const estoque = estoques.get(item.produtoId)!
      estoque.quantidade -= item.quantidade
      await estoque.save()

      await MovimentacaoEstoque.create(
        {
          estoqueId: estoque.id,
          pedidoId: pedido.id,
          usuarioId: cliente.id,
          tipo: 'SAIDA',
          quantidade: item.quantidade,
          saldoResultante: estoque.quantidade,
          motivo: `Pedido ${pedido.codigo}`,
        },
        { client: trx }
      )
    }
  }

  private detalhesDosItens(
    itens: ItemSolicitado[],
    campo: keyof ItemSolicitado,
    problemaDo: (item: ItemSolicitado) => string | undefined
  ): ErrorDetail[] {
    return itens.flatMap((item, indice) => {
      const problema = problemaDo(item)

      return problema ? [{ field: `itens[${indice}].${campo}`, issue: problema }] : []
    })
  }
}
