-- Track H — Reply Intelligence: classification columns on activities + suppression list.
-- Idempotent. Safe to re-run.

-- ---------------------------------------------------------------
-- 1. Activities: classification columns
-- ---------------------------------------------------------------
DO $$
DECLARE has_col boolean;
BEGIN
  IF to_regclass('public.activities') IS NULL THEN
    RAISE NOTICE 'public.activities does not exist; skipping reply intel columns.';
    RETURN;
  END IF;

  -- reply_classification
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='activities' AND column_name='reply_classification'
  ) INTO has_col;
  IF NOT has_col THEN
    ALTER TABLE public.activities ADD COLUMN reply_classification text
      CHECK (reply_classification IN (
        'positive_intent','meeting_requested','not_now','not_interested',
        'out_of_office','wrong_person','referral','unsubscribe_request','unclear'
      ));
  END IF;

  -- classification_confidence
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='activities' AND column_name='classification_confidence'
  ) INTO has_col;
  IF NOT has_col THEN
    ALTER TABLE public.activities ADD COLUMN classification_confidence numeric(3,2);
  END IF;

  -- classified_at
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='activities' AND column_name='classified_at'
  ) INTO has_col;
  IF NOT has_col THEN
    ALTER TABLE public.activities ADD COLUMN classified_at timestamptz;
  END IF;

  -- classified_by ('auto' | 'human')
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='activities' AND column_name='classified_by'
  ) INTO has_col;
  IF NOT has_col THEN
    ALTER TABLE public.activities ADD COLUMN classified_by text;
  END IF;

  -- sentiment_score
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='activities' AND column_name='sentiment_score'
  ) INTO has_col;
  IF NOT has_col THEN
    ALTER TABLE public.activities ADD COLUMN sentiment_score numeric(3,2);
  END IF;

  -- parsed_return_date (for out_of_office)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='activities' AND column_name='parsed_return_date'
  ) INTO has_col;
  IF NOT has_col THEN
    ALTER TABLE public.activities ADD COLUMN parsed_return_date date;
  END IF;

  -- referral_contact_hint
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='activities' AND column_name='referral_contact_hint'
  ) INTO has_col;
  IF NOT has_col THEN
    ALTER TABLE public.activities ADD COLUMN referral_contact_hint jsonb;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_activities_classification
  ON public.activities(reply_classification, classified_at DESC);

-- ---------------------------------------------------------------
-- 2. Suppression list
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.suppression_list') IS NULL THEN
    CREATE TABLE public.suppression_list (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid NOT NULL,
      contact_id uuid,
      wa_phone_e164 text,
      reason text NOT NULL CHECK (reason IN (
        'unsubscribe','not_interested','wrong_person','manual','bounce'
      )),
      source_activity_id uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      created_by uuid,
      expires_at timestamptz
    );

    CREATE INDEX idx_suppression_account_phone
      ON public.suppression_list(account_id, wa_phone_e164);
  END IF;
END $$;

ALTER TABLE public.suppression_list ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='suppression_list' AND policyname='authenticated_suppression') THEN
    CREATE POLICY authenticated_suppression ON public.suppression_list
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
