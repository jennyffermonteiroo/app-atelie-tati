-- ══════════════════════════════════════════
-- ATELIÊ TATI BRANDÃO — Schema Supabase
-- Execute isso no SQL Editor do Supabase:
-- Supabase → SQL Editor → New query → cole e clique em Run
-- ══════════════════════════════════════════

-- ── TABELA: movimentações (ganhos e vales) ──
CREATE TABLE IF NOT EXISTS records (
  id          BIGSERIAL PRIMARY KEY,
  user_key    TEXT        NOT NULL,             -- 'fabiola' | 'kaylane' | 'tati'
  type        TEXT        NOT NULL,             -- 'ganho' | 'vale'
  descricao   TEXT        NOT NULL,
  cliente     TEXT        NOT NULL DEFAULT '',
  valor       NUMERIC(10,2) NOT NULL,
  data_ref    DATE        NOT NULL,             -- data escolhida no registro
  fechado     BOOLEAN     NOT NULL DEFAULT FALSE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── TABELA: despesas do salão (perfil proprietária) ──
CREATE TABLE IF NOT EXISTS despesas (
  id          BIGSERIAL PRIMARY KEY,
  descricao   TEXT        NOT NULL,
  valor       NUMERIC(10,2) NOT NULL,
  data_ref    DATE        NOT NULL DEFAULT CURRENT_DATE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── TABELA: fechamentos de caixa ──
CREATE TABLE IF NOT EXISTS caixa_fechamentos (
  id          BIGSERIAL PRIMARY KEY,
  valor       NUMERIC(10,2) NOT NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- O app usa a chave anon com RLS desabilitado
-- por enquanto (acesso simples por senha no front).
-- Para produção com usuários reais, habilitar RLS.
-- ══════════════════════════════════════════
ALTER TABLE records            DISABLE ROW LEVEL SECURITY;
ALTER TABLE despesas           DISABLE ROW LEVEL SECURITY;
ALTER TABLE caixa_fechamentos  DISABLE ROW LEVEL SECURITY;

-- Permite todas as operações para a chave anon
GRANT ALL ON records, despesas, caixa_fechamentos TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
