-- Track F — Cadence engine: sequences v3, cadence_steps, enrollments, step_runs, proposed_enrollments.
-- Idempotent. Safe to re-run.
-- These tables coexist with sequences_v2 until full migration.

-- ---------------------------------------------------------------
-- 1. enrollments
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.enrollments') IS NULL THEN
    CREATE TABLE public.enrollments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid NOT NULL,
      sequence_id uuid NOT NULL,
      contact_id uuid NOT NULL,
      deal_id uuid,
      buying_role text,
      status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','stopped')),
      completion_reason text CHECK (completion_reason IN (
        'replied_positive','meeting_booked','reached_end','suppressed',
        'manual_stop','out_of_office_pause','wrong_person','not_interested'
      )),
      current_step_order integer DEFAULT 1,
      next_run_at timestamptz,
      paused_until timestamptz,
      enrolled_by uuid,
      enrolled_via text NOT NULL DEFAULT 'manual' CHECK (enrolled_via IN (
        'manual','committee','stage_trigger','signal','proposed'
      )),
      created_at timestamptz DEFAULT now(),
      completed_at timestamptz
    );
    CREATE UNIQUE INDEX idx_enrollment_unique_active
      ON public.enrollments(account_id, sequence_id, contact_id) WHERE status = 'active';
    CREATE INDEX idx_enrollment_next_run
      ON public.enrollments(next_run_at) WHERE status = 'active';
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 2. cadence_step_runs (audit log)
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.cadence_step_runs') IS NULL THEN
    CREATE TABLE public.cadence_step_runs (
      id bigserial PRIMARY KEY,
      account_id uuid NOT NULL,
      enrollment_id uuid NOT NULL,
      step_order integer NOT NULL,
      started_at timestamptz NOT NULL DEFAULT now(),
      ended_at timestamptz,
      outcome text CHECK (outcome IN (
        'sent','skipped_suppressed','skipped_replied','skipped_window',
        'blocked_guard','error','pending_send'
      )),
      guard_reason text,
      payload jsonb,
      rendered_text text,
      activity_id uuid
    );
    CREATE INDEX idx_step_runs_enrollment ON public.cadence_step_runs(enrollment_id, step_order);
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 3. proposed_enrollments
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.proposed_enrollments') IS NULL THEN
    CREATE TABLE public.proposed_enrollments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid NOT NULL,
      contact_id uuid NOT NULL,
      sequence_id uuid NOT NULL,
      reason text NOT NULL,
      priority integer DEFAULT 0,
      status text DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','expired')),
      created_at timestamptz DEFAULT now(),
      resolved_by uuid,
      resolved_at timestamptz
    );
    CREATE INDEX idx_proposed_pending ON public.proposed_enrollments(account_id, status, priority DESC)
      WHERE status = 'pending';
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 4. contact_automation_settings (Track B dependency)
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.contact_automation_settings') IS NULL THEN
    CREATE TABLE public.contact_automation_settings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid NOT NULL,
      contact_id uuid NOT NULL,
      openclaw_authorized boolean NOT NULL DEFAULT false,
      auto_transcribe boolean NOT NULL DEFAULT true,
      auto_download_media boolean NOT NULL DEFAULT true,
      high_stakes_lock boolean NOT NULL DEFAULT false,
      updated_at timestamptz DEFAULT now(),
      updated_by uuid,
      UNIQUE (contact_id)
    );
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadence_step_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposed_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_automation_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='enrollments' AND policyname='authenticated_enrollments') THEN
    CREATE POLICY authenticated_enrollments ON public.enrollments
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cadence_step_runs' AND policyname='authenticated_step_runs') THEN
    CREATE POLICY authenticated_step_runs ON public.cadence_step_runs
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='proposed_enrollments' AND policyname='authenticated_proposed') THEN
    CREATE POLICY authenticated_proposed ON public.proposed_enrollments
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contact_automation_settings' AND policyname='authenticated_automation') THEN
    CREATE POLICY authenticated_automation ON public.contact_automation_settings
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 6. enroll_contacts_into_sequence RPC
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enroll_contacts_into_sequence(
  p_account_id uuid,
  p_sequence_id uuid,
  p_contact_ids uuid[],
  p_deal_id uuid DEFAULT NULL,
  p_via text DEFAULT 'manual',
  p_role text DEFAULT NULL
) RETURNS TABLE(enrollment_id uuid, contact_id uuid, status text, reason text)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  c uuid;
  new_enrollment_id uuid;
BEGIN
  FOREACH c IN ARRAY p_contact_ids LOOP
    -- check suppression
    IF EXISTS (SELECT 1 FROM public.suppression_list WHERE account_id = p_account_id AND contact_id = c) THEN
      enrollment_id := NULL;
      contact_id := c;
      status := 'skipped';
      reason := 'suppressed';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- check active enrollment
    IF EXISTS (
      SELECT 1 FROM public.enrollments
       WHERE account_id = p_account_id
         AND sequence_id = p_sequence_id
         AND enrollments.contact_id = c
         AND enrollments.status = 'active'
    ) THEN
      enrollment_id := NULL;
      contact_id := c;
      status := 'skipped';
      reason := 'already_active';
      RETURN NEXT;
      CONTINUE;
    END IF;

    INSERT INTO public.enrollments(account_id, sequence_id, contact_id, deal_id, buying_role, enrolled_via, next_run_at)
    VALUES (p_account_id, p_sequence_id, c, p_deal_id, p_role, p_via, now())
    RETURNING id INTO STRICT new_enrollment_id;

    enrollment_id := new_enrollment_id;
    contact_id := c;
    status := 'enrolled';
    reason := NULL;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enroll_contacts_into_sequence(uuid, uuid, uuid[], uuid, text, text)
  TO authenticated;
