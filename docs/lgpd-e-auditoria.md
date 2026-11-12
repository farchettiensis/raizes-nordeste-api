# LGPD, privacidade e auditoria

[Voltar ao README](../README.md)

## LGPD e privacidade

O cadastro exige `consentimentoDados: true`. A finalidade desse aceite é manter a conta identificada por e-mail para autenticação, consulta de pedidos e atendimento. O cliente deve receber esta informação antes de aceitar; sem o aceite, o signup responde `422` e não cria a conta. Ele não autoriza marketing nem adesão à fidelidade. Consultar unidades e cardápios continua público.

| Dados tratados | Finalidade | Base legal adotada no projeto |
|---|---|---|
| E-mail, nome (pode ser nulo), hash da senha e data do cadastro | Manter a conta e autenticar o cliente | Consentimento específico para o cadastro (art. 7º, I) |
| Identificador do cliente, unidade, canal, itens, valores e status dos pedidos e pagamentos | Executar a compra, acompanhar preparo, pagamento e cancelamento | Execução de contrato (art. 7º, V) |
| Adesão, saldo e movimentos de pontos | Conceder e resgatar benefícios opcionais | Consentimento separado (art. 7º, I) |
| Identificadores, ação, horário, IP e requestId de auditoria | Investigar acessos indevidos e rastrear ações sensíveis | Legítimo interesse em segurança (art. 7º, IX), limitado à finalidade e ao acesso ADMIN |

O modelo ainda prevê telefone, nascimento e consentimento de marketing, mas o cadastro público não recebe esses campos. Não há campanha de marketing implementada nem coleta de CPF, endereço residencial ou dados de cartão. Observações de pedidos são texto livre para instruções de preparo: não devem conter dados pessoais ou de saúde. A API não faz classificação automática desse texto.

### Registro e revogação do consentimento

`POST /api/v1/auth/signup` aceita somente o booleano literal `true` em `consentimentoDados`. O servidor grava o instante em `users.consentimento_dados_em`, na mesma transação do cadastro e do evento `usuario.cadastrado`. Datas enviadas pelo cliente não são usadas. Contas anteriores com data nula não recebem consentimento retroativo. O seed contém somente pessoas fictícias para demonstração.

A fidelidade mantém seu próprio aceite em `consentimento_fidelidade_em`, com revogação por `DELETE /api/v1/fidelidade/adesao`. O encerramento da conta revoga todos os consentimentos. Os marcos atuais são limpos, enquanto a trilha de cadastro, adesão, revogação e encerramento preserva os horários das ações. O projeto registra o aceite e a data, mas ainda não versiona o aviso de privacidade aceito.

### Encerramento e anonimização do cadastro

O próprio CLIENTE chama `DELETE /api/v1/clientes/conta`, com seu token e `{ "password": "senha atual" }`. A senha confirma a intenção antes da operação irreversível. Equipe recebe `403`; token inválido ou senha errada recebe `401`; corpo sem senha recebe `422`. Não há parâmetro de usuário: a conta alvo é sempre a autenticada.

Em uma transação, a API remove nome, telefone, nascimento e consentimentos, substitui o e-mail por um identificador aleatório no domínio não entregável `.invalid`, troca a senha por um segredo aleatório e preenche `anonimizado_em`. Também revoga todos os tokens, expira o saldo de fidelidade, limpa as observações dos pedidos e remove IP/requestId dos registros de auditoria cujo autor ou conta alvo é o cliente. O evento `usuario.anonimizado` comprova o encerramento sem registrar os identificadores removidos. Uma falha desfaz todas essas alterações.

A resposta é `204`, sem dados pessoais. Os tokens deixam de acessar a API e as credenciais antigas não permitem novo login. O e-mail anterior pode ser usado em um novo cadastro independente, sem recuperar pedidos ou pontos da conta encerrada. Pedidos em andamento seguem seu fluxo operacional normal; o encerramento não cancela compras nem solicita estornos.

Pedidos, pagamentos, movimentos de estoque e fidelidade e auditoria permanecem vinculados às chaves internas para preservar a consistência e a rastreabilidade. Isso remove os identificadores diretos do cadastro, mas mantém um histórico pseudonimizado: não se afirma anonimização irreversível de toda a base. Motivos de cancelamento, dados operacionais e correlações com sistemas externos ainda podem permitir identificação indireta. O endpoint não apaga logs externos nem cópias de segurança.

### Estratégia de retenção

| Conjunto | Estratégia |
|---|---|
| Cadastro identificado | Enquanto a conta estiver ativa; remoção dos identificadores diretos imediatamente após solicitação autenticada |
| Pedidos, pagamentos e movimentos | Preservar o histórico pseudonimizado após o encerramento; proposta de revisão e expurgo após 5 anos, ressalvadas necessidades justificadas de guarda |
| Auditoria | Proposta de revisão e expurgo após 6 meses, com acesso restrito; IP/requestId associados à conta são removidos já no encerramento |
| Backups e logs de infraestrutura | Proposta de rotação em até 30 dias e reaplicação dos encerramentos após restauração, antes de liberar acesso |

Os prazos são escolhas propostas para o projeto acadêmico, não afirmações de prazos legais obrigatórios. Não há rotina automática de expurgo, gestão de backups ou controle de restauração implementados. Uma implantação real precisa definir e executar essa política conforme suas finalidades e obrigações de guarda.

As respostas usam transformers com lista explícita de campos e não expõem hash de senha, token armazenado, telefone ou nascimento. A senha usa hash e o token é armazenado como hash. A base conceitual está na [LGPD disponibilizada pelo Ministério da Justiça](https://www.gov.br/mj/pt-br/assuntos/sua-protecao/sedigi/Lei13709.pdf) e nas orientações da [ANPD sobre direitos dos titulares](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares).

## Auditoria

Toda ação sensível deixa um registro em `logs_auditoria`, que a matriz consulta por `GET /api/v1/auditoria` (só ADMIN), filtrando por `acao`, `entidade`, `entidadeId` e `usuarioId`. O histórico completo de um pedido sai de `?entidade=pedido&entidadeId=<id>`.

| Ação | Quando |
|---|---|
| `usuario.cadastrado` | cadastro de conta (guarda só o perfil) |
| `usuario.anonimizado` | encerramento do cadastro solicitado pelo próprio cliente |
| `auth.login`, `auth.logout` | entrada e saída |
| `auth.login_negado` | senha errada ou e-mail desconhecido; aponta a conta alvo quando ela existe |
| `pedido.criado` | criação do pedido, com unidade, canal e total |
| `pedido.status_alterado` | todo avanço de status, inclusive a aprovação pelo webhook (com `usuarioId` nulo) |
| `estoque.movimentado` | entrada ou ajuste manual, com movimento, unidade, produto, tipo, diferença, saldos anterior e resultante e motivo |
| `pedido.cancelado` | todo cancelamento, inclusive pela recusa do pagamento (com `usuarioId` nulo e o motivo da recusa), com o status de origem, o motivo, se houve estorno e se o estoque voltou |
| `pagamento.solicitado`, `pagamento.aprovado`, `pagamento.recusado`, `pagamento.estornado` | ciclo do pagamento |
| `fidelidade.aderida`, `fidelidade.revogada` | consentimento da fidelidade dado ou revogado; a revogação guarda os pontos perdidos |
| `acesso.negado` | qualquer `403` da API, com método, rota, parâmetros e código do erro |

- **Na mesma transação da ação.** O registro é gravado dentro da transação que muda o pedido ou o pagamento: ou os dois entram, ou nenhum. Uma ação que falha (estoque insuficiente, provedor fora do ar no estorno) não deixa registro de sucesso, e uma ação gravada nunca fica sem registro.
- **Negações fora da transação.** O `403` já desfez a ação, então o registro de `acesso.negado` é gravado pelo tratador de erros, para qualquer rota. Se a gravação falhar, o erro vai para o log da aplicação e a resposta continua sendo o `403` original. O `401` por falta de token não é registrado, porque não identifica ninguém e só faria ruído; a tentativa de login com senha errada é.
- **Rastreável até a requisição.** Cada registro guarda o `ip` e o `requestId`, o mesmo do cabeçalho `X-Request-Id` e do corpo de erro. Os dois vêm do contexto HTTP pelo `AsyncLocalStorage` do AdonisJS (`useAsyncLocalStorage: true`), sem precisar passar o contexto por cada serviço.
- **Minimização (LGPD).** Os registros não guardam nome, e-mail, senha, token nem o payload do provedor: só identificadores, status, valores e motivos. O IP é dado pessoal e por isso a consulta é restrita ao ADMIN.
- **Retenção.** A proposta de guarda e expurgo está na seção LGPD. A trilha de auditoria de negócio não substitui registros de acesso da infraestrutura.

Limitações conhecidas: não há expurgo automático depois do prazo de retenção, e leituras de dados pessoais (como `GET /account/profile`) não são registradas, para não encher a trilha com consultas rotineiras.
