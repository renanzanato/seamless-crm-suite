-- Track D — Extension operational tables: status, telemetry, config.
-- Idempotent. Safe to re-run.

-- ---------------------------------------------------------------
-- 1. extension_status
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.extension_status') IS NULL THEN
    CREATE TABLE public.extension_status (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid NOT NULL,
      user_id uuid NOT NULL,
      account_hash text NOT NULL,
      ext_version text NOT NULL,
      wpp_version text,
      queue_depth integer DEFAULT 0,
      last_error text,
      state text NOT NULL CHECK (state IN ('healthy','degraded','passive','offline')),
      last_heartbeat timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (account_id, user_id, account_hash)
    );
    CREATE INDEX idx_extension_status_account ON public.extension_status(account_id, last_heartbeat DESC);
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 2. extension_telemetry
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.extension_telemetry') IS NULL THEN
    CREATE TABLE public.extension_telemetry (
      id bigserial PRIMARY KEY,
      account_id uuid NOT NULL,
      user_id uuid,
      account_hash text,
      event_type text NOT NULL,
      payload jsonb NOT NULL,
      request_id text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_extension_telemetry_account ON public.extension_telemetry(account_id, created_at DESC);
    CREATE INDEX idx_extension_telemetry_type ON public.extension_telemetry(event_type, created_at DESC);
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 3. extension_config
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.extension_config') IS NULL THEN
    CREATE TABLE public.extension_config (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id uuid NOT NULL,
      selectors jsonb NOT NULL DEFAULT '{}',
      selectors_checksum text NOT NULL DEFAULT '',
      rate_limits jsonb NOT NULL DEFAULT '{"per_minute":30,"per_hour":200,"per_day":800}',
      kill_switch boolean NOT NULL DEFAULT false,
      passive_mode boolean NOT NULL DEFAULT false,
      business_hours jsonb NOT NULL DEFAULT '{"start":"09:00","end":"18:00","timezone":"America/Sao_Paulo","days":[1,2,3,4,5]}',
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------
ALTER TABLE public.extension_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extension_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extension_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='extension_status' AND policyname='authenticated_ext_status') THEN
    CREATE POLICY authenticated_ext_status ON public.extension_status
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='extension_telemetry' AND policyname='authenticated_ext_telemetry') THEN
    CREATE POLICY authenticated_ext_telemetry ON public.extension_telemetry
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='extension_config' AND policyname='authenticated_ext_config') THEN
    CREATE POLICY authenticated_ext_config ON public.extension_config
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
