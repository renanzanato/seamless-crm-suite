-- Onda 0: interactions becomes legacy/read-only.
-- Runtime writes must go to public.activities.

DO $$
DECLARE
  policy_row record;
BEGIN
  IF to_regclass('public.interactions') IS NULL THEN
    RAISE NOTICE 'public.interactions does not exist; skipping readonly contract.';
    RETURN;
  END IF;

  ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;

  FOR policy_row IN
    SELECT policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'interactions'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.interactions', policy_row.policyname);
  END LOOP;

  CREATE POLICY "interactions: legacy read only"
    ON public.interactions
    FOR SELECT
    TO authenticated
    USING (true);
END $$;

