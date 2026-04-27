-- Track F bridge -- stage-change triggers for visual sequences.
-- Idempotent. Safe to re-run.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.sequences') IS NULL THEN
    RAISE NOTICE 'public.sequences does not exist; skipping sequence trigger columns.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sequences' AND column_name = 'trigger_type'
  ) THEN
    ALTER TABLE public.sequences
      ADD COLUMN trigger_type text NOT NULL DEFAULT 'manual';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sequences_trigger_type_check'
      AND conrelid = 'public.sequences'::regclass
  ) THEN
    ALTER TABLE public.sequences
      ADD CONSTRAINT sequences_trigger_type_check
      CHECK (trigger_type IN ('manual','stage_change','signal_threshold','recurring','date_anchored'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sequences' AND column_name = 'trigger_config'
  ) THEN
    ALTER TABLE public.sequences
      ADD COLUMN trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sequences' AND column_name = 'target_role'
  ) THEN
    ALTER TABLE public.sequences
      ADD COLUMN target_role text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sequences_stage_trigger
  ON public.sequences(trigger_type)
  WHERE trigger_type = 'stage_change';

COMMIT;
