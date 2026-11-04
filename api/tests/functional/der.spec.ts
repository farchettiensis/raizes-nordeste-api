import { readFile } from 'node:fs/promises'

import db from '@adonisjs/lucid/services/db'
import { test } from '@japa/runner'

const DER = new URL('../../database/der.md', import.meta.url)

const TABELAS_DO_FRAMEWORK = ['adonis_schema', 'adonis_schema_versions']

const TIPOS: Record<string, string> = {
  'integer': 'int',
  'character varying': 'varchar',
  'text': 'text',
  'numeric': 'numeric',
  'boolean': 'boolean',
  'date': 'date',
  'timestamp with time zone': 'timestamptz',
  'jsonb': 'jsonb',
}

type Coluna = { tabela: string; coluna: string; tipo: string; nulo: boolean }
type Restricao = {
  tabela: string
  coluna: string
  tipo: string
  nome: string
  referenciada: string
}

type Der = {
  colunas: string[]
  chaves: Record<'PK' | 'FK' | 'UK', string[]>
  relacionamentos: string[]
}

async function lerDer(): Promise<Der> {
  const texto = await readFile(DER, 'utf8')
  const diagrama = texto.match(/```mermaid\n([\s\S]*?)```/)![1]
  const der: Der = { colunas: [], chaves: { PK: [], FK: [], UK: [] }, relacionamentos: [] }
  let entidade: string | null = null

  for (const linha of diagrama.split('\n').map((l) => l.trim())) {
    const abertura = linha.match(/^(\w+) \{$/)
    const atributo = linha.match(
      /^(\w+) (\w+)(?: ((?:PK|FK|UK)(?:, ?(?:PK|FK|UK))*))?(?: "[^"]*")?$/
    )
    const relacionamento = linha.match(/^(\w+) (\S{2}--\S{2}) (\w+) : /)

    if (abertura) {
      entidade = abertura[1]
    } else if (linha === '}') {
      entidade = null
    } else if (entidade && atributo) {
      const [, tipo, coluna, marcas] = atributo
      der.colunas.push(`${entidade}.${coluna} ${tipo}`)
      for (const marca of marcas?.split(/, ?/) ?? []) {
        der.chaves[marca as 'PK' | 'FK' | 'UK'].push(`${entidade}.${coluna}`)
      }
    } else if (relacionamento) {
      const [, pai, cardinalidade, filha] = relacionamento
      der.relacionamentos.push(`${pai} ${cardinalidade} ${filha}`)
    }
  }

  return der
}

async function colunasDoBanco(): Promise<Coluna[]> {
  const { rows } = await db.rawQuery(
    `select table_name as tabela, column_name as coluna, data_type as tipo, is_nullable = 'YES' as nulo
       from information_schema.columns
      where table_schema = 'public' and table_name <> all(?)`,
    [TABELAS_DO_FRAMEWORK]
  )
  return rows
}

async function restricoesDoBanco(): Promise<Restricao[]> {
  const { rows } = await db.rawQuery(
    `select tabela.relname as tabela, coluna.attname as coluna, r.oid::text as nome,
            case r.contype when 'p' then 'PRIMARY KEY' when 'f' then 'FOREIGN KEY' else 'UNIQUE' end as tipo,
            referenciada.relname as referenciada
       from pg_constraint r
       join pg_class tabela on tabela.oid = r.conrelid
       cross join unnest(r.conkey) as chave(numero)
       join pg_attribute coluna on coluna.attrelid = r.conrelid and coluna.attnum = chave.numero
       left join pg_class referenciada on referenciada.oid = r.confrelid
      where r.connamespace = 'public'::regnamespace
        and r.contype in ('p', 'f', 'u')
        and tabela.relname <> all(?)`,
    [TABELAS_DO_FRAMEWORK]
  )
  return rows
}

const ordenado = (lista: string[]) => [...lista].sort()
const deTipo = (restricoes: Restricao[], tipo: string) => restricoes.filter((r) => r.tipo === tipo)

function unicasDeUmaColuna(restricoes: Restricao[]) {
  const unicas = deTipo(restricoes, 'UNIQUE')
  return unicas.filter((r) => unicas.filter((outra) => outra.nome === r.nome).length === 1)
}

test.group('DER', () => {
  test('declara exatamente as tabelas e colunas do banco, com o tipo de cada uma', async ({
    assert,
  }) => {
    const der = await lerDer()
    const colunas = await colunasDoBanco()

    assert.deepEqual(
      ordenado(der.colunas),
      ordenado(colunas.map((c) => `${c.tabela}.${c.coluna} ${TIPOS[c.tipo] ?? c.tipo}`))
    )
  })

  test('marca as chaves primárias, estrangeiras e únicas do banco', async ({ assert }) => {
    const der = await lerDer()
    const restricoes = await restricoesDoBanco()
    const nomes = (lista: Restricao[]) => ordenado(lista.map((r) => `${r.tabela}.${r.coluna}`))

    assert.deepEqual(ordenado(der.chaves.PK), nomes(deTipo(restricoes, 'PRIMARY KEY')))
    assert.deepEqual(ordenado(der.chaves.FK), nomes(deTipo(restricoes, 'FOREIGN KEY')))
    assert.deepEqual(ordenado(der.chaves.UK), nomes(unicasDeUmaColuna(restricoes)))
  })

  test('liga cada chave estrangeira com a cardinalidade que o banco impõe', async ({ assert }) => {
    const der = await lerDer()
    const restricoes = await restricoesDoBanco()
    const colunas = await colunasDoBanco()
    const unicas = unicasDeUmaColuna(restricoes)

    const esperados = deTipo(restricoes, 'FOREIGN KEY').map((fk) => {
      const coluna = colunas.find((c) => c.tabela === fk.tabela && c.coluna === fk.coluna)!
      const ladoPai = coluna.nulo ? '|o' : '||'
      const ehUnica = unicas.some((u) => u.tabela === fk.tabela && u.coluna === fk.coluna)
      const ladoFilha = ehUnica ? 'o|' : 'o{'
      return `${fk.referenciada} ${ladoPai}--${ladoFilha} ${fk.tabela}`
    })

    assert.deepEqual(ordenado(der.relacionamentos), ordenado(esperados))
  })
})
