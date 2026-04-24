-- ══════════════════════════════════════════
-- MIGRAÇÃO — Suporte ao atendimento Bronze
-- Execute no SQL Editor do Supabase
-- ══════════════════════════════════════════

-- Adiciona coluna que guarda o valor que vai direto
-- para o caixa do salão no atendimento bronze.
-- Para registros normais (ganho/vale) esse valor é NULL / 0.
ALTER TABLE records
  ADD COLUMN IF NOT EXISTS bronze_salao NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Atualiza o enum de tipo para aceitar 'bronze'
-- (a coluna type é TEXT, então nenhuma alteração de tipo é necessária)
-- Apenas documentando os valores aceitos:
-- type: 'ganho' | 'vale' | 'bronze'

COMMENT ON COLUMN records.type IS
  'Tipo do registro: ganho (atendimento normal), vale (adiantamento), bronze (R$10 colab + excedente salão)';

COMMENT ON COLUMN records.bronze_salao IS
  'Valor do atendimento bronze que vai direto para o salão (total - 10). Apenas para type=bronze.';
