-- ============================================================
-- Pipa Driven — Contact lifecycle_stage
-- ============================================================
-- Elimina a confusao entre "base", "leads" e "contatos" — todas sao
-- a mesma tabela `contacts` com diferentes valores de lifecycle_stage.
--
--   subscriber    — entrou na base sem contexto (ex.: newsletter)
--   lead          — novo sem qualificacao (default)
--   mql           — demonstrou interesse (marketing qualified)
--   sql           — qualificado pra venda (sales qualified)
--   opportunity   — em negociacao ativa (tem deal aberto)
--   customer      — fechou
--   evangelist    — cliente indicando outros
--   disqualified  — descartado
-- ============================================================

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS lifecycle_stage text DEFAULT 'lead';

-- Limpa qualquer CHECK antigo em lifecycle_stage e adiciona o novo.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'contacts'
       AND t.relnamespace = 'public'::regnamespace
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%lifecycle_stage%'
  LOOP
    EXECUTE format('ALTER TABLE public.contacts DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_lifecycle_stage_check
  CHECK (lifecycle_stage IN (
    'subscriber', 'lead', 'mql', 'sql',
    'opportunity', 'customer', 'evangelist', 'disqualified'
  ));

-- Backfill: inferir stage baseado no estado existente do contato.
--   - contato com deal fechado ganho -> customer
--   - contato com deal aberto -> opportunity
--   - contato com deal perdido -> disqualified (soft; rep pode reativar)
--   - contato sem deal mas com interacao -> sql
--   - caso contrario -> lead (default ja aplicado)

-- Customer: tem deal com stage cujo nome contem "Ganho" ou "Won"
UPDATE public.contacts c
   SET lifecycle_stage = 'customer'
  FROM public.deals d
  JOIN public.stages s ON s.id = d.stage_id
 WHERE d.contact_id = c.id
   AND (s.name ILIKE '%ganho%' OR s.name ILIKE '%won%' OR s.name ILIKE '%fechamento%')
   AND c.lifecycle_stage = 'lead';

-- Opportunity: tem qualquer deal nao fechado (stage ativo)
UPDATE public.contacts c
   SET lifecycle_stage = 'opportunity'
  FROM public.deals d
  JOIN public.stages s ON s.id = d.stage_id
 WHERE d.contact_id = c.id
   AND s.name NOT ILIKE '%ganho%'
   AND s.name NOT ILIKE '%won%'
   AND s.name NOT ILIKE '%perdido%'
   AND s.name NOT ILIKE '%lost%'
   AND c.lifecycle_stage = 'lead';

-- SQL: sem deal mas com ao menos uma interaction/activity
UPDATE public.contacts c
   SET lifecycle_stage = 'sql'
 WHERE c.lifecycle_stage = 'lead'
   AND (
     EXISTS (SELECT 1 FROM public.interactions i WHERE i.contact_id = c.id)
     OR EXISTS (SELECT 1 FROM public.whatsapp_conversations wc WHERE wc.contact_id = c.id)
   );

-- Index pro filtro da listagem
CREATE INDEX IF NOT EXISTS idx_contacts_lifecycle_stage
  ON public.contacts (lifecycle_stage);
