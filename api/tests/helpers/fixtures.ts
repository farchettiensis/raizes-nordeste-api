import { DateTime } from 'luxon'

import Estoque from '#models/estoque'
import Produto from '#models/produto'
import Unidade from '#models/unidade'
import UnidadeProduto from '#models/unidade_produto'
import User, { type PerfilUsuario } from '#models/user'

let sequencia = 0

function proximo() {
  sequencia += 1

  return sequencia
}

export function criarUnidade(atributos: Partial<Unidade> = {}) {
  const numero = proximo()

  return Unidade.create({
    codigo: `UN${numero.toString().padStart(4, '0')}`,
    nome: `Unidade ${numero}`,
    formato: 'COMPLETA',
    cidade: 'Recife',
    estado: 'PE',
    endereco: `Rua das Tapiocas, ${numero}`,
    ativa: true,
    ...atributos,
  })
}

export function criarProduto(atributos: Partial<Produto> = {}) {
  const numero = proximo()

  return Produto.create({
    codigo: `PR${numero.toString().padStart(4, '0')}`,
    nome: `Tapioca ${numero}`,
    categoria: 'TAPIOCA',
    precoBase: '18.50',
    sazonal: false,
    ativo: true,
    ...atributos,
  })
}

export function criarUsuario(perfil: PerfilUsuario = 'CLIENTE', atributos: Partial<User> = {}) {
  const numero = proximo()

  return User.create({
    fullName: `Pessoa ${numero}`,
    email: `pessoa${numero}@raizes.test`,
    password: 'Senha@123',
    perfil,
    ...atributos,
  })
}

export async function criarCardapio(unidade: Unidade, produto: Produto, preco = '18.50') {
  return UnidadeProduto.create({
    unidadeId: unidade.id,
    produtoId: produto.id,
    preco,
    disponivel: true,
  })
}

export async function criarEstoque(unidade: Unidade, produto: Produto, quantidade = 10) {
  return Estoque.create({
    unidadeId: unidade.id,
    produtoId: produto.id,
    quantidade,
    quantidadeMinima: 2,
  })
}

export function agora() {
  return DateTime.now()
}
