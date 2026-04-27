-- Track K — Deliverability: WA quality monitoring + auto-throttle.
-- Idempotent. Safe to re-run.

-- ---------------------------------------------------------------
-- 1. wa_quality_samples
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.wa_quality_samples') IS NULL THEN
    CREATE TABLE public.wa_quality_samples (
      id bigserial PRIMARY KEY,
      account_id uuid NOT NULL,
      account_hash text NOT NULL,
      sampled_at timestamptz NOT NULL DEFAULT now(),
      quality_band text CHECK (quality_band IN ('green','yellow','red','unknown')),
      blocks_24h integer DEFAULT 0,
      reports_24h integer DEFAULT 0,
      sent_24h integer DEFAULT 0,
      replied_24h integer DEFAULT 0,
      raw_signals jsonb,
      UNIQUE (account_hash, sampled_at)
    );
    CREATE INDEX idx_wa_quality_account ON public.wa_quality_samples(account_id, sampled_at DESC);
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 2. deliverability_actions
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.deliverability_actions') IS NULL THEN
    CREATE TABLE public.deliverability_actions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid NOT NULL,
      account_hash text NOT NULL,
      action text NOT NULL CHECK (action IN (
        'throttle_up','throttle_down','pause_outbound','warning_banner','clear'
      )),
      reason text NOT NULL,
      triggered_at timestamptz DEFAULT now(),
      resolved_at timestamptz
    );
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 3. idempotency_keys (universal pattern)
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.idempotency_keys') IS NULL THEN
    CREATE TABLE public.idempotency_keys (
      account_id uuid NOT NULL,
      key text NOT NULL,
      request_hash text NOT NULL,
      response_status integer,
      response_body jsonb,
      created_at timestamptz DEFAULT now(),
      expires_at timestamptz DEFAULT now() + interval '24 hours',
      PRIMARY KEY (account_id, key)
    );
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------
ALTER TABLE public.wa_quality_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliverability_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='wa_quality_samples' AND policyname='authenticated_wa_quality') THEN
    CREATE POLICY authenticated_wa_quality ON public.wa_quality_samples
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='deliverability_actions' AND policyname='authenticated_deliverability') THEN
    CREATE POLICY authenticated_deliverability ON public.deliverability_actions
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='idempotency_keys' AND policyname='authenticated_idempotency') THEN
    CREATE POLICY authenticated_idempotency ON public.idempotency_keys
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
