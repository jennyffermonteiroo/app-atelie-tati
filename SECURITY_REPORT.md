# Relatorio de seguranca

Projeto revisado em: 2026-05-20  
Escopo: `index.html`, `script.js`, `schema.sql`, `migration.sql`, `vercel.json`, `README.md`.

## Status apos correcoes

As principais falhas encontradas neste relatorio foram tratadas no codigo:

- senhas removidas do frontend;
- login migrado para Supabase Auth;
- RLS/policies adicionadas em `schema.sql` e `migration.sql`;
- `onclick`/`oninput` inline removidos;
- dados de usuario escapados antes de entrar em templates HTML;
- headers de seguranca adicionados ao `vercel.json`;
- logs de exclusao removidos.

Para que a correcao fique efetiva no ambiente real, ainda e obrigatorio executar o setup descrito em `SECURITY_SETUP.md` no painel do Supabase.

## Resumo executivo original

O risco geral do projeto e alto. A aplicacao e um frontend estatico que acessa o Supabase diretamente com chave anonima, enquanto o banco esta configurado com RLS desativado e `GRANT ALL` para `anon`. Na pratica, qualquer pessoa que abrir o site ou inspecionar o JavaScript consegue ler, inserir, alterar e excluir registros financeiros diretamente pela API do Supabase, sem precisar passar pelo login da interface.

As principais correcoes devem ser feitas antes de usar o sistema com dados reais:

1. Migrar o login para Supabase Auth ou outro backend autenticado.
2. Ativar RLS e criar politicas por usuario/perfil.
3. Remover senhas e regras de autorizacao do frontend.
4. Escapar conteudo vindo de usuario antes de renderizar HTML.
5. Adicionar validacoes e constraints no banco.

## Achados criticos

### 1. Banco exposto para leitura, escrita, edicao e exclusao anonima

Arquivos:

- `script.js`, linhas 10-13
- `schema.sql`, linhas 42-48
- `script.js`, linhas 276-282 e 304-375

O frontend publica `SUPABASE_URL` e `SUPABASE_ANON`, e o schema desativa RLS:

- `ALTER TABLE ... DISABLE ROW LEVEL SECURITY`
- `GRANT ALL ... TO anon`

Impacto:

- Qualquer pessoa pode consultar todos os registros financeiros.
- Qualquer pessoa pode criar registros falsos.
- Qualquer pessoa pode alterar valores, datas, despesas e fechamentos.
- Qualquer pessoa pode apagar registros.
- O login da tela nao impede acesso direto ao banco.

Como explorar:

- Abrir o DevTools do navegador, copiar `SUPABASE_URL` e `SUPABASE_ANON`.
- Chamar a API REST do Supabase ou usar o proprio `db.from(...)` exposto no console.

Recomendacao:

- Ativar RLS em todas as tabelas.
- Remover `GRANT ALL TO anon`; conceder apenas o minimo necessario.
- Usar Supabase Auth com usuarios reais.
- Criar politicas:
  - colaboradora le apenas seus registros;
  - colaboradora insere apenas registros com seu proprio `user_key`;
  - proprietaria pode ler/editar/despesas conforme regra;
  - deletes e updates somente para roles autorizadas.

### 2. Senhas e autorizacao ficam no JavaScript do cliente

Arquivo:

- `script.js`, linhas 15-24 e 381-404

O objeto `USERS` contem senhas em texto claro:

- `0308`
- `1234`
- `admin`

Impacto:

- Qualquer visitante consegue ver todas as senhas no codigo-fonte.
- Qualquer pessoa pode entrar como proprietaria.
- As senhas nao podem ser protegidas por hash porque rodam no cliente.
- Mesmo trocando as senhas, elas continuariam expostas no bundle.

Recomendacao:

- Remover completamente autenticacao local.
- Usar Supabase Auth, com senha armazenada pelo provedor.
- Persistir perfil/role em tabela separada, protegida por RLS.

### 3. Controle de perfil pode ser burlado pelo console

Arquivos:

- `script.js`, linhas 28-44
- `script.js`, linhas 381-404
- `script.js`, linhas 427-451

O papel do usuario e mantido em `currentUser`, uma variavel global no navegador. As telas e funcoes de proprietaria tambem ficam carregadas para todos.

Impacto:

- Um usuario pode alterar `currentUser` pelo console.
- Pode chamar funcoes como `showScreen('s-dona')`, `loadAll()`, `deleteRecord(...)`, `updateRecord(...)`.
- Como o banco aceita `anon` com permissao total, a alteracao no console vira acesso real aos dados.

Recomendacao:

- Fazer autorizacao no servidor/banco via RLS, nunca apenas no DOM.
- Nao confiar em `currentUser` para decidir permissoes de leitura/escrita.

## Achados altos

### 4. XSS armazenado por uso de `innerHTML` com dados de usuario

Arquivos:

- `script.js`, linhas 611-652
- `script.js`, linhas 681-699
- `script.js`, linhas 716-735
- `script.js`, linhas 807-809
- `script.js`, linhas 898-916

Campos como cliente, descricao e despesa sao inseridos em templates HTML sem escape, por exemplo `${r.desc}` e `${d.desc}`.

Impacto:

- Um atacante pode gravar HTML/JavaScript em um registro.
- Quando outra pessoa abrir o painel, o script malicioso executa no navegador dela.
- Como a app tem a chave Supabase no cliente, um XSS pode ler, alterar ou apagar dados.

Exemplo de payload possivel:

```html
<img src=x onerror="alert('xss')">
```

Recomendacao:

- Renderizar dados com `textContent`, nao `innerHTML`.
- Se precisar montar HTML, usar uma funcao de escape para `&`, `<`, `>`, `"`, `'`.
- Evitar colocar dados de usuario dentro de atributos `onclick`.
- Remover handlers inline e usar `addEventListener`.

### 5. Falta validacao forte no banco

Arquivos:

- `schema.sql`, linhas 8-34
- `migration.sql`, linhas 7-20

O banco nao possui constraints para limitar:

- `user_key` aos usuarios validos;
- `type` aos tipos validos;
- valores positivos;
- relacao entre `type='bronze'`, `valor=10` e `bronze_salao > 0`;
- limites de tamanho para textos.

Impacto:

- Um atacante pode inserir registros com `user_key` arbitrario.
- Pode inserir valores negativos ou tipos inesperados.
- Pode corromper calculos financeiros.

Recomendacao:

- Adicionar `CHECK` constraints.
- Considerar tabelas normalizadas para usuarios/perfis.
- Criar constraints de valor minimo e tipos permitidos.

## Achados medios

### 6. CDN sem versao exata e sem SRI

Arquivo:

- `index.html`, linha 321

O script carrega:

```html
https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2
```

Impacto:

- O app depende de codigo externo em tempo de execucao.
- `@2` permite atualizacoes dentro da major version sem controle do projeto.
- Nao ha Subresource Integrity para detectar alteracao do arquivo entregue.

Recomendacao:

- Fixar uma versao exata.
- Usar SRI quando carregar via CDN.
- Preferir empacotar dependencia no build, quando houver build.

### 7. Ausencia de headers de seguranca

Arquivo:

- `vercel.json`, linhas 1-5

O deploy define apenas rewrites. Nao ha headers como:

- `Content-Security-Policy`
- `X-Content-Type-Options`
- `Referrer-Policy`
- `Permissions-Policy`
- `Strict-Transport-Security`

Impacto:

- XSS fica mais facil de explorar.
- Reduz protecoes padrao do navegador.

Recomendacao:

- Adicionar headers no `vercel.json`.
- Depois de remover inline handlers, usar uma CSP sem `unsafe-inline`.

### 8. Logs podem expor dados operacionais

Arquivo:

- `script.js`, linhas 362-375

As funcoes de exclusao imprimem ids, status, dados e erros no console.

Impacto:

- Facilita enumeracao e depuracao por terceiros.
- Pode expor detalhes internos do Supabase.

Recomendacao:

- Remover logs de producao.
- Registrar erros de forma controlada, sem dados sensiveis.

## Pontos positivos encontrados

- Nao ha uso de `eval` ou `new Function`.
- Nao ha SQL manual concatenado no frontend.
- As operacoes usam cliente Supabase, o que reduz risco de SQL injection direta.
- Alguns campos usam `textContent`, por exemplo mensagens e confirmacao de exclusao, mas isso ainda nao cobre as listas renderizadas por `innerHTML`.

## Plano recomendado de correcao

### Prioridade 1

1. Ativar Supabase Auth.
2. Criar tabela `profiles` com `id`, `user_key`, `role`.
3. Ativar RLS nas tabelas.
4. Remover `GRANT ALL TO anon`.
5. Criar politicas de `select`, `insert`, `update`, `delete`.

### Prioridade 2

1. Trocar renderizacao por `textContent`/DOM API.
2. Remover `onclick` inline.
3. Validar e limitar entradas no banco com `CHECK`.
4. Remover logs de debug.

### Prioridade 3

1. Adicionar headers de seguranca no Vercel.
2. Fixar versao do Supabase JS.
3. Criar ambiente separado para desenvolvimento/producao.
4. Documentar procedimento de recuperacao/backup do banco.

## Conclusao

O sistema esta funcional para prototipo ou uso local, mas nao esta seguro para producao com dados reais. O principal problema nao e a chave anonima por si so, e sim o uso dela junto com RLS desativado, permissoes totais para `anon` e autenticacao apenas no frontend. Corrigindo autenticacao/RLS e XSS armazenado, o risco cai de alto para um patamar muito mais controlavel.
