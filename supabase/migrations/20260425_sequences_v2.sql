-- Onda 8: Sequences V2 - Apollo-style builder
-- Idempotente: IF NOT EXISTS em tudo

-- 1. sequence_steps_v2: node-based steps
CREATE TABLE IF NOT EXISTS public.sequence_steps_v2 (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.sequences(id) ON DELETE CASCADE,
  position    int NOT NULL DEFAULT 0,
  step_type   text NOT NULL CHECK (step_type IN (
    'email_manual', 'email_auto', 'call_task', 'linkedin_task',
    'whatsapp_task', 'wait', 'condition'
  )),
  config      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ssv2_sequence ON public.sequence_steps_v2 (sequence_id, position);

-- 2. sequence_step_runs: execution tracking per enrollment per step
CREATE TABLE IF NOT EXISTS public.sequence_step_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL,
  step_id       uuid NOT NULL REFERENCES public.sequence_steps_v2(id) ON DELETE CASCADE,
  run_at        timestamptz NOT NULL DEFAULT now(),
  status        text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','skipped','failed')),
  channel       text,
  message_id    text,
  opened_at     timestamptz,
  clicked_at    timestamptz,
  replied_at    timestamptz,
  error_msg     text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ssr_enrollment ON public.sequence_step_runs (enrollment_id, run_at);
CREATE INDEX IF NOT EXISTS idx_ssr_step ON public.sequence_step_runs (step_id);

-- 3. Add stop_on_reply flag to sequences if not exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sequences' AND column_name = 'stop_on_reply'
  ) THEN
    ALTER TABLE public.sequences ADD COLUMN stop_on_reply boolean NOT NULL DEFAULT true;
  END IF;
END $$;

-- 4. Add max_enrollments_per_day to sequences if not exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sequences' AND column_name = 'max_enrollments_per_day'
  ) THEN
    ALTER TABLE public.sequences ADD COLUMN max_enrollments_per_day int DEFAULT 50;
  END IF;
END $$;

-- 5. RLS
ALTER TABLE public.sequence_steps_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequence_step_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sequence_steps_v2' AND policyname = 'ssv2_auth_select') THEN
    CREATE POLICY ssv2_auth_select ON public.sequence_steps_v2 FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sequence_steps_v2' AND policyname = 'ssv2_auth_insert') THEN
    CREATE POLICY ssv2_auth_insert ON public.sequence_steps_v2 FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sequence_steps_v2' AND policyname = 'ssv2_auth_update') THEN
    CREATE POLICY ssv2_auth_update ON public.sequence_steps_v2 FOR UPDATE USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sequence_steps_v2' AND policyname = 'ssv2_auth_delete') THEN
    CREATE POLICY ssv2_auth_delete ON public.sequence_steps_v2 FOR DELETE USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sequence_step_runs' AND policyname = 'ssr_auth_select') THEN
    CREATE POLICY ssr_auth_select ON public.sequence_step_runs FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sequence_step_runs' AND policyname = 'ssr_auth_insert') THEN
    CREATE POLICY ssr_auth_insert ON public.sequence_step_runs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sequence_step_runs' AND policyname = 'ssr_auth_update') THEN
    CREATE POLICY ssr_auth_update ON public.sequence_step_runs FOR UPDATE USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- 6. Add channel to sequences if missing (V2 uses 'both' as third option)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sequences' AND column_name = 'channel'
  ) THEN
    ALTER TABLE public.sequences ADD COLUMN channel text DEFAULT 'whatsapp';
  END IF;
END $$;

-- 7. Ensure cadence_tracks has position and last_step_at for worker
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cadence_tracks' AND column_name = 'position'
  ) THEN
    ALTER TABLE public.cadence_tracks ADD COLUMN position int NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cadence_tracks' AND column_name = 'last_step_at'
  ) THEN
    ALTER TABLE public.cadence_tracks ADD COLUMN last_step_at timestamptz;
  END IF;
END $$;

-- 8. Unique index on step_runs for idempotency (prevent duplicate runs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ssr_idempotent
  ON public.sequence_step_runs (enrollment_id, step_id)
  WHERE status IN ('sent', 'queued');
