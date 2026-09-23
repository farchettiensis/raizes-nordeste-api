import { DateTime } from 'luxon'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

import Estoque from '#models/estoque'
import Produto from '#models/produto'
import Unidade from '#models/unidade'
import UnidadeProduto from '#models/unidade_produto'
import User from '#models/user'

const UNIDADES = [
  {
    codigo: 'REC001',
    nome: 'Raízes Boa Viagem',
    formato: 'COMPLETA' as const,
    cidade: 'Recife',
    estado: 'PE',
    endereco: 'Av. Boa Viagem, 1200',
    telefone: '8133334444',
    ativa: true,
  },
  {
    codigo: 'REC002',
    nome: 'Raízes Marco Zero',
    formato: 'REDUZIDA' as const,
    cidade: 'Recife',
    estado: 'PE',
    endereco: 'Praça Rio Branco, 30',
    telefone: '8133335555',
    ativa: true,
  },
  {
    codigo: 'CGR001',
    nome: 'Raízes Campina Grande',
    formato: 'COMPLETA' as const,
    cidade: 'Campina Grande',
    estado: 'PB',
    endereco: 'Rua Venâncio Neiva, 88',
    telefone: '8333336666',
    ativa: true,
  },
  {
    codigo: 'FOR001',
    nome: 'Raízes Iracema',
    formato: 'REDUZIDA' as const,
    cidade: 'Fortaleza',
    estado: 'CE',
    endereco: 'Av. Beira Mar, 450',
    telefone: '8533337777',
    ativa: false,
  },
]

const PRODUTOS = [
  {
    codigo: 'TAP001',
    nome: 'Tapioca de carne de sol com queijo coalho',
    descricao: 'Tapioca recheada com carne de sol desfiada e queijo coalho',
    categoria: 'TAPIOCA',
    precoBase: '22.00',
    sazonal: false,
  },
  {
    codigo: 'TAP002',
    nome: 'Tapioca de frango com catupiry',
    descricao: 'Tapioca recheada com frango desfiado e catupiry',
    categoria: 'TAPIOCA',
    precoBase: '19.50',
    sazonal: false,
  },
  {
    codigo: 'CUS001',
    nome: 'Cuscuz recheado com carne de sol',
    descricao: 'Cuscuz nordestino recheado com carne de sol e manteiga de garrafa',
    categoria: 'CUSCUZ',
    precoBase: '24.00',
    sazonal: false,
  },
  {
    codigo: 'BOL001',
    nome: 'Bolo de macaxeira',
    descricao: 'Fatia de bolo de macaxeira com coco',
    categoria: 'BOLO',
    precoBase: '12.00',
    sazonal: false,
  },
  {
    codigo: 'BOL002',
    nome: 'Canjica junina',
    descricao: 'Canjica cremosa servida no período junino',
    categoria: 'BOLO',
    precoBase: '14.00',
    sazonal: true,
  },
  {
    codigo: 'SUC001',
    nome: 'Suco de caju',
    descricao: 'Suco natural de caju, 400ml',
    categoria: 'BEBIDA',
    precoBase: '9.00',
    sazonal: false,
  },
  {
    codigo: 'SUC002',
    nome: 'Suco de umbu',
    descricao: 'Suco natural de umbu, 400ml',
    categoria: 'BEBIDA',
    precoBase: '9.50',
    sazonal: false,
  },
  {
    codigo: 'CAF001',
    nome: 'Café coado',
    descricao: 'Café coado na hora, 200ml',
    categoria: 'BEBIDA',
    precoBase: '6.00',
    sazonal: false,
  },
]

const CARDAPIOS: Record<string, { produto: string; preco: string; quantidade: number }[]> = {
  REC001: [
    { produto: 'TAP001', preco: '22.00', quantidade: 40 },
    { produto: 'TAP002', preco: '19.50', quantidade: 35 },
    { produto: 'CUS001', preco: '24.00', quantidade: 20 },
    { produto: 'BOL001', preco: '12.00', quantidade: 25 },
    { produto: 'BOL002', preco: '14.00', quantidade: 0 },
    { produto: 'SUC001', preco: '9.00', quantidade: 60 },
    { produto: 'SUC002', preco: '9.50', quantidade: 18 },
    { produto: 'CAF001', preco: '6.00', quantidade: 80 },
  ],
  REC002: [
    { produto: 'TAP001', preco: '23.50', quantidade: 15 },
    { produto: 'BOL001', preco: '13.00', quantidade: 10 },
    { produto: 'SUC001', preco: '10.00', quantidade: 30 },
    { produto: 'CAF001', preco: '6.50', quantidade: 40 },
  ],
  CGR001: [
    { produto: 'TAP002', preco: '18.00', quantidade: 22 },
    { produto: 'CUS001', preco: '22.50', quantidade: 26 },
    { produto: 'SUC002', preco: '8.50', quantidade: 12 },
    { produto: 'CAF001', preco: '5.50', quantidade: 50 },
  ],
  FOR001: [{ produto: 'TAP001', preco: '25.00', quantidade: 5 }],
}

const EQUIPE = [
  { fullName: 'Francisca Nogueira', email: 'admin@raizes.test', perfil: 'ADMIN' as const },
  {
    fullName: 'Gerente Boa Viagem',
    email: 'gerente@raizes.test',
    perfil: 'GERENTE' as const,
    unidade: 'REC001',
  },
  {
    fullName: 'Atendente Boa Viagem',
    email: 'atendente@raizes.test',
    perfil: 'ATENDENTE' as const,
    unidade: 'REC001',
  },
  {
    fullName: 'Cozinha Boa Viagem',
    email: 'cozinha@raizes.test',
    perfil: 'COZINHA' as const,
    unidade: 'REC001',
  },
]

const SENHA_PADRAO = 'Senha@123'

export default class extends BaseSeeder {
  async run() {
    const unidades = await Unidade.updateOrCreateMany('codigo', UNIDADES)
    const produtos = await Produto.updateOrCreateMany(
      'codigo',
      PRODUTOS.map((produto) => ({ ...produto, ativo: true }))
    )

    const porCodigoUnidade = new Map(unidades.map((unidade) => [unidade.codigo, unidade]))
    const porCodigoProduto = new Map(produtos.map((produto) => [produto.codigo, produto]))

    for (const [codigoUnidade, itens] of Object.entries(CARDAPIOS)) {
      const unidade = porCodigoUnidade.get(codigoUnidade)!

      for (const item of itens) {
        const produto = porCodigoProduto.get(item.produto)!

        await UnidadeProduto.updateOrCreate(
          { unidadeId: unidade.id, produtoId: produto.id },
          { preco: item.preco, disponivel: true }
        )

        await Estoque.updateOrCreate(
          { unidadeId: unidade.id, produtoId: produto.id },
          { quantidade: item.quantidade, quantidadeMinima: 5 }
        )
      }
    }

    for (const membro of EQUIPE) {
      const { unidade, ...dados } = membro

      await User.updateOrCreate(
        { email: membro.email },
        {
          ...dados,
          password: SENHA_PADRAO,
          unidadeId: unidade ? porCodigoUnidade.get(unidade)!.id : null,
          consentimentoDadosEm: DateTime.now(),
        }
      )
    }

    await User.updateOrCreate(
      { email: 'cliente@raizes.test' },
      {
        fullName: 'Joana Cliente',
        perfil: 'CLIENTE',
        password: SENHA_PADRAO,
        consentimentoDadosEm: DateTime.now(),
        consentimentoFidelidadeEm: DateTime.now(),
      }
    )
  }
}
