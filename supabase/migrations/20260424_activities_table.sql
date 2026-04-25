-- ============================================================
-- Pipa Driven — Activities (timeline unificada)
-- ============================================================
-- Feed único cronológico reverso com todos os eventos relevantes
-- para contato/empresa/deal:
--   - notas manuais (kind='note')
--   - emails enviados/recebidos (kind='email')
--   - ligações (kind='call')
--   - reuniões (kind='meeting')
--   - mensagens WhatsApp (kind='whatsapp') — dual-write a partir da
--     função ingest_whatsapp_chat
--   - tarefas criadas (kind='task')
--   - passos de cadência executados (kind='sequence_step')
--   - mudança de estágio de deal (kind='stage_change')
--   - mudança de propriedade (kind='property_change')
--   - enrollment em sequence (kind='enrollment')
--
-- Referencia contato / empresa / deal (todos opcionais). Um evento
-- pode estar ligado a um contato específico dentro de uma empresa,
-- ou só à empresa (ex.: sinal ABM), ou só ao deal.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.activities (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL CHECK (kind IN (
    'note', 'email', 'call', 'meeting', 'whatsapp', 'task',
    'sequence_step', 'stage_change', 'property_change', 'enrollment'
  )),
  subject      text,
  body         text,
  direction    text CHECK (direction IS NULL OR direction IN ('in', 'out')),
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  contact_id   uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  company_id   uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  deal_id      uuid REFERENCES public.deals(id) ON DELETE CASCADE,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Dedup opcional por chave natural dentro do payload (ex.: wa_message_id
-- em mensagens WhatsApp). Permite ON CONFLICT DO NOTHING na RPC.
CREATE UNIQUE INDEX IF NOT EXISTS activities_whatsapp_msg_unique
  ON public.activities ((payload->>'wa_message_id'))
  WHERE kind = 'whatsapp' AND payload ? 'wa_message_id';

CREATE INDEX IF NOT EXISTS idx_activities_contact_occurred
  ON public.activities (contact_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_activities_company_occurred
  ON public.activities (company_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_activities_deal_occurred
  ON public.activities (deal_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_activities_kind_occurred
  ON public.activities (kind, occurred_at DESC);

-- RLS: rep vê o que é dele (via contact/company ownership), admin vê tudo.
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activities: owner or admin reads"   ON public.activities;
DROP POLICY IF EXISTS "activities: authenticated inserts"  ON public.activities;
DROP POLICY IF EXISTS "activities: owner updates"          ON public.activities;
DROP POLICY IF EXISTS "activities: admin deletes"          ON public.activities;

CREATE POLICY "activities: owner or admin reads"
  ON public.activities FOR SELECT
  USING (
    public.is_admin()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.contacts c
       WHERE c.id = activities.contact_id
         AND c.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.companies co
       WHERE co.id = activities.company_id
         AND co.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.deals d
       WHERE d.id = activities.deal_id
         AND d.owner_id = auth.uid()
    )
  );

CREATE POLICY "activities: authenticated inserts"
  ON public.activities FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "activities: owner updates"
  ON public.activities FOR UPDATE
  USING (created_by = auth.uid() OR public.is_admin());

CREATE POLICY "activities: admin deletes"
  ON public.activities FOR DELETE
  USING (public.is_admin());
