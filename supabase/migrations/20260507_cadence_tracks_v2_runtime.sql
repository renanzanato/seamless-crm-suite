-- Track F bridge — run visual sequences through cadence_tracks.
-- Idempotent. Safe to re-run.

DO $$
BEGIN
  IF to_regclass('public.cadence_tracks') IS NULL THEN
    RAISE NOTICE 'public.cadence_tracks does not exist; skipping V2 runtime bridge.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'cadence_tracks'
       AND column_name = 'sequence_id'
  ) THEN
    ALTER TABLE public.cadence_tracks
      ADD COLUMN sequence_id uuid REFERENCES public.sequences(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'cadence_tracks'
       AND column_name = 'paused_until'
  ) THEN
    ALTER TABLE public.cadence_tracks
      ADD COLUMN paused_until timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'cadence_tracks'
       AND column_name = 'completion_reason'
  ) THEN
    ALTER TABLE public.cadence_tracks
      ADD COLUMN completion_reason text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cadence_tracks_sequence_status
  ON public.cadence_tracks(sequence_id, status)
  WHERE sequence_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cadence_tracks_paused_until
  ON public.cadence_tracks(paused_until)
  WHERE status = 'paused' AND paused_until IS NOT NULL;
