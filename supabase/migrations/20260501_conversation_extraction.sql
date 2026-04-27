-- Track J — Conversation Extractions.
-- Idempotent. Safe to re-run.

DO $$
BEGIN
  IF to_regclass('public.conversation_extractions') IS NULL THEN
    CREATE TABLE public.conversation_extractions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid NOT NULL,
      activity_id uuid NOT NULL,
      deal_id uuid,
      contact_id uuid,
      extraction_type text NOT NULL CHECK (extraction_type IN (
        'next_step','decision_maker_mentioned','objection','price_quoted',
        'date_agreed','competitor_mentioned','pain_point','budget_signal','timeline_signal'
      )),
      payload jsonb NOT NULL,
      confidence numeric(3,2) NOT NULL,
      risk_level text NOT NULL CHECK (risk_level IN ('low','medium','high')),
      status text NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending','auto_applied','approved','rejected','superseded'
      )),
      applied_at timestamptz,
      reviewed_by uuid,
      reviewed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (activity_id, extraction_type)
    );

    CREATE INDEX idx_extractions_pending
      ON public.conversation_extractions(account_id, status, risk_level, created_at DESC)
      WHERE status = 'pending';
  END IF;
END $$;

ALTER TABLE public.conversation_extractions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='conversation_extractions' AND policyname='authenticated_extractions') THEN
    CREATE POLICY authenticated_extractions ON public.conversation_extractions
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
