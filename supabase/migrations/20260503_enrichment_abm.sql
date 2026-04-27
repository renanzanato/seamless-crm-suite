-- Track G — Enrichment + ABM tiering.
-- Idempotent. Safe to re-run.

-- ---------------------------------------------------------------
-- 1. Companies: ABM + enrichment columns
-- ---------------------------------------------------------------
DO $$
DECLARE has_col boolean;
BEGIN
  IF to_regclass('public.companies') IS NULL THEN
    RAISE NOTICE 'public.companies does not exist; skipping enrichment columns.';
    RETURN;
  END IF;

  -- account_tier
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='companies' AND column_name='account_tier'
  ) INTO has_col;
  IF NOT has_col THEN
    ALTER TABLE public.companies ADD COLUMN account_tier text
      CHECK (account_tier IN ('tier_1','tier_2','tier_3'));
  END IF;

  -- tam_score
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='companies' AND column_name='tam_score'
  ) INTO has_col;
  IF NOT has_col THEN
    ALTER TABLE public.companies ADD COLUMN tam_score numeric(5,2);
  END IF;

  -- target_persona_count
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='companies' AND column_name='target_persona_count'
  ) INTO has_col;
  IF NOT has_col THEN
    ALTER TABLE public.companies ADD COLUMN target_persona_count integer DEFAULT 0;
  END IF;

  -- icp_match_reasons
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='companies' AND column_name='icp_match_reasons'
  ) INTO has_col;
  IF NOT has_col THEN
    ALTER TABLE public.companies ADD COLUMN icp_match_reasons jsonb DEFAULT '[]';
  END IF;

  -- last_enriched_at
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='companies' AND column_name='last_enriched_at'
  ) INTO has_col;
  IF NOT has_col THEN
    ALTER TABLE public.companies ADD COLUMN last_enriched_at timestamptz;
  END IF;

  -- enrichment_provider
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='companies' AND column_name='enrichment_provider'
  ) INTO has_col;
  IF NOT has_col THEN
    ALTER TABLE public.companies ADD COLUMN enrichment_provider text;
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 2. Contacts: normalized + enrichment columns
-- ---------------------------------------------------------------
DO $$
DECLARE has_col boolean;
BEGIN
  IF to_regclass('public.contacts') IS NULL THEN
    RAISE NOTICE 'public.contacts does not exist; skipping.';
    RETURN;
  END IF;

  -- normalized_phone
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='contacts' AND column_name='normalized_phone'
  ) INTO has_col;
  IF NOT has_col THEN
    ALTER TABLE public.contacts ADD COLUMN normalized_phone text;
  END IF;

  -- last_enriched_at
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='contacts' AND column_name='last_enriched_at'
  ) INTO has_col;
  IF NOT has_col THEN
    ALTER TABLE public.contacts ADD COLUMN last_enriched_at timestamptz;
  END IF;

  -- enrichment_confidence
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='contacts' AND column_name='enrichment_confidence'
  ) INTO has_col;
  IF NOT has_col THEN
    ALTER TABLE public.contacts ADD COLUMN enrichment_confidence numeric(3,2);
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 3. Contact merge candidates
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.contact_merge_candidates') IS NULL THEN
    CREATE TABLE public.contact_merge_candidates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid NOT NULL,
      contact_a_id uuid NOT NULL,
      contact_b_id uuid NOT NULL,
      similarity numeric(3,2) NOT NULL,
      match_reasons jsonb NOT NULL,
      status text DEFAULT 'pending' CHECK (status IN ('pending','merged','dismissed')),
      created_at timestamptz NOT NULL DEFAULT now(),
      resolved_by uuid,
      resolved_at timestamptz,
      CHECK (contact_a_id < contact_b_id)
    );
  END IF;
END $$;

ALTER TABLE public.contact_merge_candidates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contact_merge_candidates' AND policyname='authenticated_merge') THEN
    CREATE POLICY authenticated_merge ON public.contact_merge_candidates
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
