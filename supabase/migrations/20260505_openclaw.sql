-- Track C — OpenClaw runtime: openclaw_runs, coaching_notes, meeting_briefs.
-- Idempotent. Safe to re-run.

-- ---------------------------------------------------------------
-- 1. openclaw_runs
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.openclaw_runs') IS NULL THEN
    CREATE TABLE public.openclaw_runs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid NOT NULL,
      enrollment_id uuid,
      contact_id uuid NOT NULL,
      deal_id uuid,
      intent text NOT NULL CHECK (intent IN (
        'outbound_first_touch','followup','nurture',
        'meeting_prep','meeting_recap','reanimation'
      )),
      status text NOT NULL DEFAULT 'queued' CHECK (status IN (
        'queued','rendering','validating','awaiting_approval',
        'sending','sent','failed','rejected'
      )),
      draft_text text,
      final_text text,
      high_stakes boolean DEFAULT false,
      validator_score jsonb,
      approved_by uuid,
      approved_at timestamptz,
      sent_at timestamptz,
      error_code text,
      created_at timestamptz DEFAULT now()
    );
    CREATE INDEX idx_openclaw_runs_status
      ON public.openclaw_runs(account_id, status, created_at DESC);
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 2. coaching_notes
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.coaching_notes') IS NULL THEN
    CREATE TABLE public.coaching_notes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid NOT NULL,
      user_id uuid NOT NULL,
      deal_id uuid,
      activity_id uuid,
      note_type text NOT NULL CHECK (note_type IN (
        'discovery_quality','objection_handling','next_step_clarity',
        'rapport','closing','listening_ratio'
      )),
      suggestion text NOT NULL,
      severity text CHECK (severity IN ('info','medium','high')),
      acknowledged_by uuid,
      acknowledged_at timestamptz,
      created_at timestamptz DEFAULT now()
    );
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 3. meeting_briefs
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.meeting_briefs') IS NULL THEN
    CREATE TABLE public.meeting_briefs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid NOT NULL,
      deal_id uuid NOT NULL,
      meeting_at timestamptz NOT NULL,
      brief_text text NOT NULL,
      committee_snapshot jsonb,
      open_objections jsonb,
      recent_extractions jsonb,
      generated_at timestamptz DEFAULT now(),
      UNIQUE (deal_id, meeting_at)
    );
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------
ALTER TABLE public.openclaw_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_briefs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='openclaw_runs' AND policyname='authenticated_openclaw') THEN
    CREATE POLICY authenticated_openclaw ON public.openclaw_runs
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='coaching_notes' AND policyname='authenticated_coaching') THEN
    CREATE POLICY authenticated_coaching ON public.coaching_notes
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='meeting_briefs' AND policyname='authenticated_briefs') THEN
    CREATE POLICY authenticated_briefs ON public.meeting_briefs
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
