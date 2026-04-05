-- ============================================================
-- Módulo Funil — Pipa Driven CRM
-- ============================================================

-- Tabela de funis
CREATE TABLE IF NOT EXISTS funnels (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Tabela de estágios
CREATE TABLE IF NOT EXISTS stages (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  funnel_id  uuid REFERENCES funnels(id) ON DELETE CASCADE NOT NULL,
  name       text NOT NULL,
  "order"    integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Tabela de negócios (cards do kanban)
CREATE TABLE IF NOT EXISTS deals (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name           text NOT NULL,
  company        text,
  value          numeric DEFAULT 0,
  assignee_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assignee_name  text,
  stage_id       uuid REFERENCES stages(id) ON DELETE SET NULL,
  funnel_id      uuid REFERENCES funnels(id) ON DELETE CASCADE,
  created_at     timestamptz DEFAULT now()
);

-- Tabela de histórico de movimentação
CREATE TABLE IF NOT EXISTS deal_history (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id    uuid REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  from_stage uuid REFERENCES stages(id) ON DELETE SET NULL,
  to_stage   uuid REFERENCES stages(id) ON DELETE SET NULL NOT NULL,
  moved_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  moved_at   timestamptz DEFAULT now()
);

-- ============================================================
-- Índices
-- ============================================================
CREATE INDEX IF NOT EXISTS stages_funnel_id_order ON stages(funnel_id, "order");
CREATE INDEX IF NOT EXISTS deals_funnel_id ON deals(funnel_id);
CREATE INDEX IF NOT EXISTS deals_stage_id ON deals(stage_id);
CREATE INDEX IF NOT EXISTS deal_history_deal_id ON deal_history(deal_id);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE funnels     ENABLE ROW LEVEL SECURITY;
ALTER TABLE stages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_history ENABLE ROW LEVEL SECURITY;

-- Usuários autenticados leem tudo
CREATE POLICY "funnels_select" ON funnels     FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "stages_select"  ON stages      FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "deals_select"   ON deals       FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "history_select" ON deal_history FOR SELECT USING (auth.role() = 'authenticated');

-- Apenas admins escrevem em funnels e stages
-- (controle via service role ou policy customizada por role no perfil)
CREATE POLICY "funnels_write" ON funnels
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "stages_write" ON stages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Usuários autenticados escrevem em deals e deal_history
CREATE POLICY "deals_write"   ON deals        FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "history_write" ON deal_history FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================
-- Seed — Funis padrão
-- ============================================================
WITH
  prev AS (
    INSERT INTO funnels (name) VALUES ('Pré-vendas') RETURNING id
  ),
  com AS (
    INSERT INTO funnels (name) VALUES ('Comercial') RETURNING id
  ),
  prev_stages AS (
    INSERT INTO stages (funnel_id, name, "order")
    SELECT id, unnest(ARRAY[
      'Novos Leads',
      'Tentativa de Contato',
      'Contato com Sucesso',
      'Conexão',
      'Reunião Agendada'
    ]), generate_series(0, 4)
    FROM prev
    RETURNING id
  ),
  com_stages AS (
    INSERT INTO stages (funnel_id, name, "order")
    SELECT id, unnest(ARRAY[
      'Reunião Realizada',
      'Reunião 2 Marcada',
      'Reunião 2 Realizada',
      'Negociação',
      'Forecast',
      'Fechamento',
      'Ganho / Perdido'
    ]), generate_series(0, 6)
    FROM com
    RETURNING id
  )
SELECT 1;