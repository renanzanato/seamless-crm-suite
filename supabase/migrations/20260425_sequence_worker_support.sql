-- Onda 5 — suporte para worker de sequencias / cadence_tracks como enrollment
-- Idempotente: pode rodar mais de uma vez.

ALTER TABLE public.cadence_tracks
  ADD COLUMN IF NOT EXISTS enrolled_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Garante que tracks antigos tenham enrolled_at para o worker calcular o dia.
UPDATE public.cadence_tracks
   SET enrolled_at = COALESCE(enrolled_at, created_at, now())
 WHERE enrolled_at IS NULL;

-- Amplia o status para funcionar como enrollment sem quebrar valores legados.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
       AND t.relname = 'cadence_tracks'
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.cadence_tracks DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.cadence_tracks
  ADD CONSTRAINT cadence_tracks_status_check
  CHECK (status IN (
    'pending', 'done', 'skipped', 'replied',
    'active', 'paused', 'completed',
    'meeting_booked', 'proposal_sent', 'won', 'lost', 'errored'
  ));

CREATE INDEX IF NOT EXISTS idx_cadence_tracks_active_enrolled
  ON public.cadence_tracks (status, enrolled_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_cadence_tracks_contact_status
  ON public.cadence_tracks (contact_id, status);

CREATE INDEX IF NOT EXISTS idx_daily_tasks_cadence_day_type
  ON public.daily_tasks (cadence_track_id, cadence_day, task_type)
  WHERE cadence_track_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activities_sequence_task
  ON public.activities ((payload->>'daily_task_id'))
  WHERE kind = 'sequence_step' AND payload ? 'daily_task_id';

CREATE OR REPLACE FUNCTION public.touch_cadence_tracks_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_cadence_tracks_updated_at ON public.cadence_tracks;
CREATE TRIGGER trg_touch_cadence_tracks_updated_at
BEFORE UPDATE ON public.cadence_tracks
FOR EACH ROW
EXECUTE FUNCTION public.touch_cadence_tracks_updated_at();

CREATE OR REPLACE FUNCTION public.unenroll_active_cadence_tracks_for_deal_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_stage text;
  next_status text;
BEGIN
  IF NEW.stage IS NOT DISTINCT FROM OLD.stage THEN
    RETURN NEW;
  END IF;

  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  normalized_stage := lower(coalesce(NEW.stage, ''));

  IF normalized_stage LIKE '%reunião%' OR normalized_stage LIKE '%reuniao%' THEN
    next_status := 'meeting_booked';
  ELSIF normalized_stage LIKE '%proposta%'
     OR normalized_stage LIKE '%fechamento%'
     OR normalized_stage LIKE '%fechado%' THEN
    next_status := 'proposal_sent';
  ELSE
    RETURN NEW;
  END IF;

  UPDATE public.cadence_tracks
     SET status = next_status,
         completed_at = COALESCE(completed_at, now())
   WHERE company_id = NEW.company_id
     AND status = 'active';

  UPDATE public.companies
     SET cadence_status = next_status,
         cadence_day = GREATEST(COALESCE(cadence_day, 0), 1)
   WHERE id = NEW.company_id
     AND cadence_status = 'active';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_unenroll_cadence_on_deal_stage ON public.deals;
CREATE TRIGGER trg_unenroll_cadence_on_deal_stage
AFTER UPDATE OF stage ON public.deals
FOR EACH ROW
EXECUTE FUNCTION public.unenroll_active_cadence_tracks_for_deal_stage();
