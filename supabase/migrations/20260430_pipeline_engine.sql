-- Track I — Pipeline engine: buying committee, momentum, quotas, snapshots.
-- Idempotent. Safe to re-run.

-- ---------------------------------------------------------------
-- 1. deal_contacts (buying committee)
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.deal_contacts') IS NULL THEN
    CREATE TABLE public.deal_contacts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid NOT NULL,
      deal_id uuid NOT NULL,
      contact_id uuid NOT NULL,
      buying_role text NOT NULL CHECK (buying_role IN (
        'decision_maker','economic_buyer','champion','influencer','user',
        'technical','legal','finance','blocker','unknown'
      )),
      role_confidence numeric(3,2) DEFAULT 0.5,
      engagement_score integer DEFAULT 0,
      added_at timestamptz NOT NULL DEFAULT now(),
      added_by uuid,
      removed_at timestamptz,
      UNIQUE (deal_id, contact_id)
    );
    CREATE INDEX idx_deal_contacts_deal ON public.deal_contacts(deal_id) WHERE removed_at IS NULL;
    CREATE INDEX idx_deal_contacts_role ON public.deal_contacts(deal_id, buying_role) WHERE removed_at IS NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 2. deals extension columns
-- ---------------------------------------------------------------
DO $$
DECLARE has_col boolean;
BEGIN
  IF to_regclass('public.deals') IS NULL THEN
    RAISE NOTICE 'public.deals does not exist; skipping deals extension columns.';
    RETURN;
  END IF;

  -- last_activity_at
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='deals' AND column_name='last_activity_at'
  ) INTO has_col;
  IF NOT has_col THEN
    ALTER TABLE public.deals ADD COLUMN last_activity_at timestamptz;
  END IF;

  -- aging_days (computed in app, not GENERATED because it depends on now())
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='deals' AND column_name='aging_days'
  ) INTO has_col;
  IF NOT has_col THEN
    ALTER TABLE public.deals ADD COLUMN aging_days integer DEFAULT 0;
  END IF;

  -- momentum_score
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='deals' AND column_name='momentum_score'
  ) INTO has_col;
  IF NOT has_col THEN
    ALTER TABLE public.deals ADD COLUMN momentum_score numeric(5,2) DEFAULT 0;
  END IF;

  -- single_threaded_risk (trigger-maintained)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='deals' AND column_name='single_threaded_risk'
  ) INTO has_col;
  IF NOT has_col THEN
    ALTER TABLE public.deals ADD COLUMN single_threaded_risk boolean DEFAULT true;
  END IF;

  -- next_step_text (for Track J extractions)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='deals' AND column_name='next_step_text'
  ) INTO has_col;
  IF NOT has_col THEN
    ALTER TABLE public.deals ADD COLUMN next_step_text text;
  END IF;

  -- next_step_due
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='deals' AND column_name='next_step_due'
  ) INTO has_col;
  IF NOT has_col THEN
    ALTER TABLE public.deals ADD COLUMN next_step_due date;
  END IF;

  -- open_objections
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='deals' AND column_name='open_objections'
  ) INTO has_col;
  IF NOT has_col THEN
    ALTER TABLE public.deals ADD COLUMN open_objections jsonb DEFAULT '[]';
  END IF;

  -- last_extraction_at
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='deals' AND column_name='last_extraction_at'
  ) INTO has_col;
  IF NOT has_col THEN
    ALTER TABLE public.deals ADD COLUMN last_extraction_at timestamptz;
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 3. Trigger: refresh single_threaded_risk
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_refresh_single_threaded_risk()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE target_deal uuid;
BEGIN
  target_deal := COALESCE(NEW.deal_id, OLD.deal_id);
  UPDATE public.deals SET single_threaded_risk = (
    SELECT COUNT(*) <= 1 FROM public.deal_contacts
     WHERE deal_id = target_deal AND removed_at IS NULL
  ) WHERE id = target_deal;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_deal_contacts_st_risk ON public.deal_contacts;
CREATE TRIGGER trg_deal_contacts_st_risk
  AFTER INSERT OR UPDATE OR DELETE ON public.deal_contacts
  FOR EACH ROW EXECUTE FUNCTION public.fn_refresh_single_threaded_risk();

-- ---------------------------------------------------------------
-- 4. quotas
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.quotas') IS NULL THEN
    CREATE TABLE public.quotas (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid NOT NULL,
      user_id uuid,
      period_type text NOT NULL CHECK (period_type IN ('daily','weekly','monthly','quarterly')),
      period_start date NOT NULL,
      period_end date NOT NULL,
      meetings_target integer DEFAULT 0,
      pipeline_target_brl numeric(14,2) DEFAULT 0,
      revenue_target_brl numeric(14,2) DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (account_id, user_id, period_type, period_start)
    );
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 5. business_days_remaining function
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.business_days_remaining(
  p_end date,
  p_tz text DEFAULT 'America/Sao_Paulo'
) RETURNS integer
LANGUAGE sql STABLE
AS $$
  SELECT COUNT(*)::integer FROM generate_series(
    (now() AT TIME ZONE p_tz)::date, p_end, interval '1 day'
  ) d WHERE EXTRACT(ISODOW FROM d) < 6;
$$;

-- ---------------------------------------------------------------
-- 6. deal_state_snapshots
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.deal_state_snapshots') IS NULL THEN
    CREATE TABLE public.deal_state_snapshots (
      id bigserial PRIMARY KEY,
      account_id uuid NOT NULL,
      snapshot_date date NOT NULL,
      deal_id uuid NOT NULL,
      stage text,
      value_brl numeric(14,2),
      owner_id uuid,
      momentum numeric(5,2),
      captured_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (snapshot_date, deal_id)
    );
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 7. RLS (deal_contacts, quotas, deal_state_snapshots)
-- ---------------------------------------------------------------
ALTER TABLE public.deal_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_state_snapshots ENABLE ROW LEVEL SECURITY;

-- Policies use auth.uid() since we don't have jwt_account_id() yet.
-- When multi-tenant lands, replace with account_id from JWT.

DO $$
BEGIN
  -- deal_contacts: allow all for authenticated (single-tenant for now)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='deal_contacts' AND policyname='authenticated_deal_contacts') THEN
    CREATE POLICY authenticated_deal_contacts ON public.deal_contacts
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='quotas' AND policyname='authenticated_quotas') THEN
    CREATE POLICY authenticated_quotas ON public.quotas
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='deal_state_snapshots' AND policyname='authenticated_snapshots') THEN
    CREATE POLICY authenticated_snapshots ON public.deal_state_snapshots
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
