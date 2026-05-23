# Setup de seguranca no Supabase

As correcoes de codigo dependem destas configuracoes no painel do Supabase.

## 1. Criar usuarios no Supabase Auth

Em `Authentication > Users`, crie usuarios com estes e-mails:

- `fabiola@atelietatibrandao.app`
- `kaylane@atelietatibrandao.app`
- `tati@atelietatibrandao.app`
- `salao@atelietatibrandao.app`

Defina senhas fortes e diferentes. As senhas antigas foram removidas do codigo.

## 2. Executar SQL

Para um banco novo, execute `schema.sql`.

Para um banco que ja tem dados, execute `migration.sql`.

## 3. Conferir RLS

No Supabase, confira se RLS esta ativo nestas tabelas:

- `profiles`
- `records`
- `despesas`
- `caixa_fechamentos`

Confira tambem se nao existe policy antiga liberando `anon`.

## 4. Validar acessos

Depois de publicar:

- Login como colaboradora deve mostrar somente os registros dela.
- Colaboradora deve conseguir inserir apenas registros dela.
- Colaboradora nao deve ver despesas nem dados de outras colaboradoras.
- Proprietaria deve ver equipe, despesas e historico.
- Chamadas anonimas para tabelas devem falhar sem sessao autenticada.
