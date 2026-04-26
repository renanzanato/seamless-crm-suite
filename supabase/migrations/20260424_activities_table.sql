-- ============================================================
-- Pipa Driven - Activities (unified CRM timeline)
-- ============================================================
-- Canonical chronological feed for contact/company/deal records.
-- This migration is intentionally defensive because production may have
-- received different WhatsApp/interactions schemas during the MVP phase.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN (
    'note', 'email', 'call', 'meeting', 'whatsapp', 'task',
    'sequence_step', 'stage_change', 'property_change', 'enrollment'
  )),
  subject text,
  body text,
  direction text CHECK (direction IS NULL OR direction IN ('in', 'out')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.deals(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Natural-key dedupe. WhatsApp must be unique per chat + provider message.
DROP INDEX IF EXISTS public.activities_whatsapp_msg_unique;
CREATE UNIQUE INDEX IF NOT EXISTS activities_whatsapp_chat_msg_unique
  ON public.activities ((payload->>'chat_key'), (payload->>'wa_message_id'))
  WHERE kind = 'whatsapp'
    AND payload ? 'chat_key'
    AND payload ? 'wa_message_id';

CREATE UNIQUE INDEX IF NOT EXISTS activities_source_unique
  ON public.activities ((payload->>'source_table'), (payload->>'source_id'))
  WHERE payload ? 'source_table'
    AND payload ? 'source_id';

CREATE INDEX IF NOT EXISTS idx_activities_contact_occurred
  ON public.activities (contact_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_activities_company_occurred
  ON public.activities (company_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_activities_deal_occurred
  ON public.activities (deal_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_activities_kind_occurred
  ON public.activities (kind, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_activities_occurred
  ON public.activities (occurred_at DESC);

-- Backfill legacy ABM interactions into the unified timeline.
DO $$
BEGIN
  IF to_regclass('public.interactions') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $sql$
    INSERT INTO public.activities (
      kind, subject, body, direction, occurred_at, created_by,
      contact_id, company_id, deal_id, payload
    )
    SELECT
      CASE
        WHEN i.interaction_type IN ('whatsapp_sent', 'whatsapp_received') THEN 'whatsapp'
        WHEN i.interaction_type IN ('email_sent', 'email_received') THEN 'email'
        WHEN i.interaction_type IN ('call_made', 'call_received') THEN 'call'
        WHEN i.interaction_type = 'meeting' THEN 'meeting'
        WHEN i.interaction_type = 'note' THEN 'note'
        WHEN i.interaction_type = 'cadence_step' THEN 'sequence_step'
        ELSE 'note'
      END,
      NULLIF(BTRIM(COALESCE(i.summary, '')), ''),
      NULLIF(BTRIM(COALESCE(i.content, i.summary, '')), ''),
      CASE
        WHEN COALESCE(i.direction, '') = 'outbound'
          OR i.interaction_type IN ('whatsapp_sent', 'email_sent', 'call_made', 'linkedin_sent', 'proposal_sent', 'cadence_step')
        THEN 'out'
        WHEN COALESCE(i.direction, '') = 'inbound'
          OR i.interaction_type IN ('whatsapp_received', 'email_received', 'call_received', 'linkedin_received')
        THEN 'in'
        ELSE NULL
      END,
      COALESCE(i.created_at, now()),
      i.created_by,
      i.contact_id,
      i.company_id,
      i.deal_id,
      COALESCE(i.metadata, '{}'::jsonb) || jsonb_build_object(
        'source_table', 'interactions',
        'source_id', i.id::text,
        'interaction_type', i.interaction_type,
        'channel', i.channel
      )
    FROM public.interactions i
    ON CONFLICT DO NOTHING
  $sql$;
END;
$$;

-- Backfill WhatsApp messages. Uses to_jsonb(row) so old schemas missing
-- optional columns do not fail at parse time.
DO $$
BEGIN
  IF to_regclass('public.whatsapp_messages') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $sql$
    INSERT INTO public.activities (
      kind, body, direction, occurred_at, created_by,
      contact_id, company_id, deal_id, payload
    )
    SELECT
      'whatsapp',
      COALESCE(
        NULLIF(BTRIM(to_jsonb(wm)->>'body'), ''),
        NULLIF(BTRIM(to_jsonb(wm)->>'content_md'), ''),
        NULLIF(BTRIM(to_jsonb(wm)->>'content'), '')
      ),
      CASE
        WHEN LOWER(COALESCE(to_jsonb(wm)->>'direction', '')) IN ('out', 'outbound', 'sent') THEN 'out'
        WHEN LOWER(COALESCE(to_jsonb(wm)->>'from_me', '')) IN ('true', 't', '1', 'yes') THEN 'out'
        WHEN LOWER(COALESCE(to_jsonb(wm)->>'direction', '')) IN ('in', 'inbound', 'received') THEN 'in'
        ELSE NULL
      END,
      COALESCE(
        NULLIF(to_jsonb(wm)->>'occurred_at', '')::timestamptz,
        NULLIF(to_jsonb(wm)->>'timestamp_wa', '')::timestamptz,
        NULLIF(to_jsonb(wm)->>'sent_at', '')::timestamptz,
        NULLIF(to_jsonb(wm)->>'created_at', '')::timestamptz,
        now()
      ),
      CASE
        WHEN COALESCE(to_jsonb(wm)->>'created_by', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (to_jsonb(wm)->>'created_by')::uuid
        ELSE NULL
      END,
      CASE
        WHEN COALESCE(to_jsonb(wm)->>'contact_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (to_jsonb(wm)->>'contact_id')::uuid
        WHEN COALESCE(to_jsonb(wc)->>'contact_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (to_jsonb(wc)->>'contact_id')::uuid
        ELSE NULL
      END,
      CASE
        WHEN COALESCE(to_jsonb(wm)->>'company_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (to_jsonb(wm)->>'company_id')::uuid
        WHEN COALESCE(to_jsonb(wc)->>'company_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (to_jsonb(wc)->>'company_id')::uuid
        ELSE NULL
      END,
      CASE
        WHEN COALESCE(to_jsonb(wm)->>'deal_id', to_jsonb(wm)->>'crm_deal_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN COALESCE(to_jsonb(wm)->>'deal_id', to_jsonb(wm)->>'crm_deal_id')::uuid
        ELSE NULL
      END,
      COALESCE(to_jsonb(wm)->'metadata', '{}'::jsonb) || jsonb_build_object(
        'source_table', 'whatsapp_messages',
        'source_id', wm.id::text,
        'chat_key', COALESCE(
          NULLIF(to_jsonb(wm)->>'chat_key', ''),
          NULLIF(to_jsonb(wc)->>'chat_key', ''),
          CASE
            WHEN NULLIF(to_jsonb(wm)->>'chat_id', '') IS NOT NULL THEN 'wa:' || (to_jsonb(wm)->>'chat_id')
            WHEN NULLIF(to_jsonb(wc)->>'wa_chat_id', '') IS NOT NULL THEN 'wa:' || (to_jsonb(wc)->>'wa_chat_id')
            ELSE NULL
          END
        ),
        'wa_message_id', COALESCE(
          NULLIF(to_jsonb(wm)->>'wa_message_id', ''),
          NULLIF(to_jsonb(wm)->>'provider_message_id', ''),
          NULLIF(to_jsonb(wm)->>'raw_id', '')
        ),
        'wa_chat_id', COALESCE(
          NULLIF(to_jsonb(wm)->>'chat_id', ''),
          NULLIF(to_jsonb(wc)->>'wa_chat_id', '')
        ),
        'message_type', COALESCE(
          NULLIF(to_jsonb(wm)->>'message_type', ''),
          NULLIF(to_jsonb(wm)->>'type', ''),
          'text'
        )
      )
    FROM public.whatsapp_messages wm
    LEFT JOIN public.whatsapp_conversations wc
      ON wc.id::text = NULLIF(to_jsonb(wm)->>'conversation_id', '')
      OR NULLIF(to_jsonb(wc)->>'chat_key', '') = NULLIF(to_jsonb(wm)->>'chat_key', '')
      OR NULLIF(to_jsonb(wc)->>'wa_chat_id', '') = NULLIF(to_jsonb(wm)->>'chat_id', '')
    ON CONFLICT DO NOTHING
  $sql$;
END;
$$;

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activities: owner or admin reads" ON public.activities;
DROP POLICY IF EXISTS "activities: authenticated inserts" ON public.activities;
DROP POLICY IF EXISTS "activities: owner updates" ON public.activities;
DROP POLICY IF EXISTS "activities: admin deletes" ON public.activities;

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
  USING (created_by = auth.uid() OR public.is_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_admin());

CREATE POLICY "activities: admin deletes"
  ON public.activities FOR DELETE
  USING (public.is_admin());
