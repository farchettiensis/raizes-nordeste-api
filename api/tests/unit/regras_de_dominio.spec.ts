import { DateTime } from 'luxon'
import { test } from '@japa/runner'

import Estoque from '#models/estoque'
import FidelidadeConta from '#models/fidelidade_conta'
import Promocao from '#models/promocao'
import User from '#models/user'
import Pedido, {
  CANAIS_PEDIDO,
  STATUS_PEDIDO,
  TRANSICOES_STATUS_PEDIDO,
  type CanalPedido,
  type StatusPedido,
} from '#models/pedido'

function pedidoCom(status: StatusPedido) {
  const pedido = new Pedido()
  pedido.status = status

  return pedido
}

function estoqueCom(quantidade: number, quantidadeMinima = 2) {
  const estoque = new Estoque()
  estoque.quantidade = quantidade
  estoque.quantidadeMinima = quantidadeMinima

  return estoque
}

test.group('Canais de pedido', () => {
  test('a rede atende exatamente os cinco canais previstos', ({ assert }) => {
    assert.deepEqual([...CANAIS_PEDIDO], ['APP', 'TOTEM', 'BALCAO', 'PICKUP', 'WEB'])
  })

  test('o canal aceito pelo tipo e o mesmo declarado na constante', ({ assert }) => {
    const canal: CanalPedido = 'TOTEM'

    assert.include(CANAIS_PEDIDO, canal)
  })
})

test.group('Ciclo de vida do pedido', () => {
  test('o pedido nasce aguardando pagamento e so avanca pelas transicoes previstas', ({
    assert,
  }) => {
    const pedido = pedidoCom('AGUARDANDO_PAGAMENTO')

    assert.isTrue(pedido.podeTransicionarPara('PAGO'))
    assert.isTrue(pedido.podeTransicionarPara('CANCELADO'))
    assert.isFalse(pedido.podeTransicionarPara('PRONTO'))
    assert.isFalse(pedido.podeTransicionarPara('ENTREGUE'))
  })

  test('o fluxo completo da cozinha ate a entrega e permitido passo a passo', ({ assert }) => {
    const caminho: StatusPedido[] = [
      'AGUARDANDO_PAGAMENTO',
      'PAGO',
      'EM_PREPARO',
      'PRONTO',
      'ENTREGUE',
    ]

    caminho.slice(0, -1).forEach((status, indice) => {
      assert.isTrue(
        pedidoCom(status).podeTransicionarPara(caminho[indice + 1]),
        `${status} deveria avancar para ${caminho[indice + 1]}`
      )
    })
  })

  test('pedido entregue ou cancelado e final', ({ assert }) => {
    assert.isTrue(pedidoCom('ENTREGUE').finalizado)
    assert.isTrue(pedidoCom('CANCELADO').finalizado)

    STATUS_PEDIDO.filter((status) => !['ENTREGUE', 'CANCELADO'].includes(status)).forEach(
      (status) => {
        assert.isFalse(pedidoCom(status).finalizado, `${status} nao deveria ser final`)
      }
    )
  })

  test('cancelar e possivel enquanto o pedido nao estiver finalizado', ({ assert }) => {
    STATUS_PEDIDO.forEach((status) => {
      const esperado = !['ENTREGUE', 'CANCELADO'].includes(status)

      assert.equal(pedidoCom(status).podeTransicionarPara('CANCELADO'), esperado, status)
    })
  })

  test('nenhum status transiciona para si mesmo', ({ assert }) => {
    STATUS_PEDIDO.forEach((status) => {
      assert.notInclude(TRANSICOES_STATUS_PEDIDO[status], status)
    })
  })
})

test.group('Disponibilidade de estoque', () => {
  test('o estoque so atende quantidades ate o saldo disponivel', ({ assert }) => {
    const estoque = estoqueCom(3)

    assert.isTrue(estoque.atende(3))
    assert.isFalse(estoque.atende(4))
  })

  test('o estoque avisa quando chega ao minimo', ({ assert }) => {
    assert.isTrue(estoqueCom(2, 2).abaixoDoMinimo)
    assert.isTrue(estoqueCom(1, 2).abaixoDoMinimo)
    assert.isFalse(estoqueCom(3, 2).abaixoDoMinimo)
  })
})

test.group('Saldo de fidelidade', () => {
  test('o resgate exige saldo suficiente e pontos positivos', ({ assert }) => {
    const conta = new FidelidadeConta()
    conta.saldoPontos = 120

    assert.isTrue(conta.podeResgatar(120))
    assert.isFalse(conta.podeResgatar(121))
    assert.isFalse(conta.podeResgatar(0))
    assert.isFalse(conta.podeResgatar(-10))
  })
})

test.group('Aplicacao de promocoes', () => {
  function promocaoValida(atributos: Partial<Promocao> = {}) {
    const promocao = new Promocao()
    promocao.ativa = true
    promocao.iniciaEm = DateTime.now().minus({ days: 1 })
    promocao.terminaEm = DateTime.now().plus({ days: 1 })
    promocao.canalPedido = null
    promocao.unidadeId = null
    promocao.valorMinimoPedido = '0'

    return Object.assign(promocao, atributos)
  }

  test('uma promocao da rede vale para qualquer canal e qualquer unidade', ({ assert }) => {
    assert.isTrue(promocaoValida().aplicavelA('TOTEM', 7, 50))
    assert.isTrue(promocaoValida().aplicavelA('APP', 99, 50))
  })

  test('uma promocao restrita a um canal nao vale nos demais', ({ assert }) => {
    const promocao = promocaoValida({ canalPedido: 'APP' })

    assert.isTrue(promocao.aplicavelA('APP', 1, 50))
    assert.isFalse(promocao.aplicavelA('TOTEM', 1, 50))
  })

  test('uma promocao de unidade nao vale em outra unidade', ({ assert }) => {
    const promocao = promocaoValida({ unidadeId: 1 })

    assert.isTrue(promocao.aplicavelA('APP', 1, 50))
    assert.isFalse(promocao.aplicavelA('APP', 2, 50))
  })

  test('o valor minimo do pedido e respeitado', ({ assert }) => {
    const promocao = promocaoValida({ valorMinimoPedido: '40.00' })

    assert.isTrue(promocao.aplicavelA('APP', 1, 40))
    assert.isFalse(promocao.aplicavelA('APP', 1, 39.99))
  })

  test('promocao fora da vigencia ou inativa nao se aplica', ({ assert }) => {
    const expirada = promocaoValida({ terminaEm: DateTime.now().minus({ hours: 1 }) })
    const futura = promocaoValida({ iniciaEm: DateTime.now().plus({ hours: 1 }) })
    const inativa = promocaoValida({ ativa: false })

    assert.isFalse(expirada.aplicavelA('APP', 1, 50))
    assert.isFalse(futura.aplicavelA('APP', 1, 50))
    assert.isFalse(inativa.aplicavelA('APP', 1, 50))
  })
})

test.group('Perfis de usuario', () => {
  function usuarioCom(perfil: User['perfil']) {
    const usuario = new User()
    usuario.perfil = perfil

    return usuario
  }

  test('atendente, cozinha e gerente pertencem a uma unidade', ({ assert }) => {
    assert.isTrue(usuarioCom('ATENDENTE').vinculadoAUnidade)
    assert.isTrue(usuarioCom('COZINHA').vinculadoAUnidade)
    assert.isTrue(usuarioCom('GERENTE').vinculadoAUnidade)
  })

  test('cliente e admin nao pertencem a uma unidade', ({ assert }) => {
    assert.isFalse(usuarioCom('CLIENTE').vinculadoAUnidade)
    assert.isFalse(usuarioCom('ADMIN').vinculadoAUnidade)
  })

  test('temPerfil aceita uma lista de perfis', ({ assert }) => {
    const gerente = usuarioCom('GERENTE')

    assert.isTrue(gerente.temPerfil('ADMIN', 'GERENTE'))
    assert.isFalse(gerente.temPerfil('CLIENTE', 'ATENDENTE'))
  })

  test('a adesao a fidelidade depende do consentimento registrado', ({ assert }) => {
    const semConsentimento = usuarioCom('CLIENTE')
    semConsentimento.consentimentoFidelidadeEm = null

    const comConsentimento = usuarioCom('CLIENTE')
    comConsentimento.consentimentoFidelidadeEm = DateTime.now()

    assert.isFalse(semConsentimento.consentiuFidelidade)
    assert.isTrue(comConsentimento.consentiuFidelidade)
  })
})

test.group('Permissoes de transicao do pedido', () => {
  const UNIDADE = 1
  const DONO = 10

  function pedidoDaUnidade(status: StatusPedido) {
    const pedido = pedidoCom(status)
    pedido.unidadeId = UNIDADE
    pedido.clienteId = DONO

    return pedido
  }

  function usuario(perfil: User['perfil'], atributos: Partial<User> = {}) {
    const pessoa = new User()
    pessoa.id = 99
    pessoa.perfil = perfil
    pessoa.unidadeId = perfil === 'CLIENTE' || perfil === 'ADMIN' ? null : UNIDADE

    return Object.assign(pessoa, atributos)
  }

  function quemPode(origem: StatusPedido, destino: StatusPedido) {
    const pedido = pedidoDaUnidade(origem)
    const candidatos = [
      usuario('CLIENTE', { id: DONO }),
      usuario('ATENDENTE'),
      usuario('COZINHA'),
      usuario('GERENTE'),
      usuario('ADMIN'),
    ]

    return candidatos
      .filter((candidato) => pedido.podeSerTransicionadoPor(candidato, destino))
      .map((candidato) => candidato.perfil)
  }

  test('a cozinha e o gerente iniciam o preparo e marcam o pedido como pronto', ({ assert }) => {
    assert.deepEqual(quemPode('PAGO', 'EM_PREPARO'), ['COZINHA', 'GERENTE'])
    assert.deepEqual(quemPode('EM_PREPARO', 'PRONTO'), ['COZINHA', 'GERENTE'])
  })

  test('o atendente e o gerente entregam o pedido pronto', ({ assert }) => {
    assert.deepEqual(quemPode('PRONTO', 'ENTREGUE'), ['ATENDENTE', 'GERENTE'])
  })

  test('aguardando pagamento, cancelam o dono, o atendente, o gerente e o admin', ({ assert }) => {
    assert.deepEqual(quemPode('AGUARDANDO_PAGAMENTO', 'CANCELADO'), [
      'CLIENTE',
      'ATENDENTE',
      'GERENTE',
      'ADMIN',
    ])
  })

  test('depois de pago, so o gerente e o admin cancelam', ({ assert }) => {
    for (const origem of ['PAGO', 'EM_PREPARO', 'PRONTO'] as const) {
      assert.deepEqual(quemPode(origem, 'CANCELADO'), ['GERENTE', 'ADMIN'], origem)
    }
  })

  test('ninguem marca o pedido como pago, que so vem do webhook', ({ assert }) => {
    assert.deepEqual(quemPode('AGUARDANDO_PAGAMENTO', 'PAGO'), [])
  })

  test('transicoes fora do ciclo de vida nao sao permitidas a ninguem', ({ assert }) => {
    assert.deepEqual(quemPode('PAGO', 'PRONTO'), [])
    assert.deepEqual(quemPode('ENTREGUE', 'CANCELADO'), [])
    assert.deepEqual(quemPode('CANCELADO', 'EM_PREPARO'), [])
  })

  test('o cliente so cancela o proprio pedido', ({ assert }) => {
    const pedido = pedidoDaUnidade('AGUARDANDO_PAGAMENTO')

    assert.isFalse(pedido.podeSerTransicionadoPor(usuario('CLIENTE', { id: 11 }), 'CANCELADO'))
  })

  test('a equipe so age sobre pedidos da propria unidade', ({ assert }) => {
    const pedido = pedidoDaUnidade('PAGO')

    assert.isFalse(
      pedido.podeSerTransicionadoPor(usuario('COZINHA', { unidadeId: 2 }), 'EM_PREPARO')
    )
    assert.isFalse(
      pedido.podeSerTransicionadoPor(usuario('GERENTE', { unidadeId: null }), 'CANCELADO')
    )
  })
})
