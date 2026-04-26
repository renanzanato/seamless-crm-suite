-- Onda 0: deals.stage_id is canonical.
-- Keeps legacy deals.stage untouched if it exists, but backfills stage_id from it.

DO $$
DECLARE
  has_deals boolean;
  has_stage_id boolean;
  has_stage_text boolean;
BEGIN
  SELECT to_regclass('public.deals') IS NOT NULL INTO has_deals;
  IF NOT has_deals THEN
    RAISE NOTICE 'public.deals does not exist; skipping deals stage contract.';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'deals'
       AND column_name = 'stage_id'
  ) INTO has_stage_id;

  IF NOT has_stage_id THEN
    ALTER TABLE public.deals
      ADD COLUMN stage_id uuid REFERENCES public.stages(id) ON DELETE SET NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'deals'
       AND column_name = 'stage'
  ) INTO has_stage_text;

  IF has_stage_text AND to_regclass('public.stages') IS NOT NULL THEN
    EXECUTE $sql$
      UPDATE public.deals d
         SET stage_id = s.id
        FROM public.stages s
       WHERE d.stage_id IS NULL
         AND lower(trim(s.name)) = lower(trim(d.stage))
    $sql$;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS deals_stage_id_idx
  ON public.deals(stage_id);

