# Modelo de dados: decisões

[Voltar ao README](../README.md)

O DER está em [`api/database/der.md`](../api/database/der.md). Este arquivo reúne as decisões por trás dele.

## Decisões

- **O canal é dado de domínio.** `pedidos.canal_pedido` é obrigatório e aceita `APP`, `TOTEM`, `BALCAO`, `PICKUP` e `WEB`. A lista vive em `CANAIS_PEDIDO`, no model `Pedido`, e é dali que saem tanto o tipo TypeScript da coluna quanto a validação de entrada.
- **Preço é copiado para o item do pedido.** `pedido_itens.preco_unitario` e `nome_produto` guardam o valor no momento da compra, para que uma alteração de cardápio não reescreva o histórico de vendas.
- **Unidades são heterogêneas.** O cardápio e o estoque são por unidade, então duas unidades podem ofertar produtos diferentes e a preços diferentes sem quebrar o padrão da rede.
- **Pagamento é desacoplado.** A tabela `pagamentos` guarda os payloads de ida e volta do provedor externo, o que permite auditar a negociação inteira sem que o sistema processe pagamento.
- **Invariantes numéricas no banco.** Estoque não fica negativo, item de pedido exige quantidade positiva, saldo de fidelidade não fica negativo e uma unidade não repete o mesmo produto no cardápio ou no estoque.

## Schema gerado

No AdonisJS 7 as migrations são a fonte da verdade do esquema. Depois de `node ace migration:run`, o Lucid lê o banco e regenera `database/schema.ts` com as classes de coluna tipadas. Esse arquivo não deve ser editado à mão. Os models estendem essas classes e ficam só com relações e regras de negócio.

Colunas de valores fechados são declaradas como `string` na migration. A lista válida vive no model que a possui, como uma `const` marcada `as const`, e `database/schema_rules.ts` aponta a coluna para o tipo derivado dela. Assim `pedido.canalPedido` é `CanalPedido` no TypeScript, e não `string`, sem que o esquema precise de migration a cada valor novo.
