-- ============================================================
-- Pipa Driven - Contact lifecycle_stage
-- ============================================================
-- "Base", "lead", "MQL" and "SQL" are filters over contacts,
-- not separate business objects.
-- ============================================================

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS lifecycle_stage text;

ALTER TABLE public.contacts
  ALTER COLUMN lifecycle_stage SET DEFAULT 'lead';

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'contacts'
       AND t.relnamespace = 'public'::regnamespace
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%lifecycle_stage%'
  LOOP
    EXECUTE format('ALTER TABLE public.contacts DROP CONSTRAINT %I', r.conname);
  END LOOP;
END;
$$;

UPDATE public.contacts
   SET lifecycle_stage = 'lead'
 WHERE lifecycle_stage IS NULL
    OR BTRIM(lifecycle_stage) = ''
    OR lifecycle_stage NOT IN (
      'subscriber', 'lead', 'mql', 'sql',
      'opportunity', 'customer', 'evangelist', 'disqualified'
    );

-- Customer / opportunity backfill from current deal stages. Dynamic SQL
-- keeps the migration safe if an older database is missing stages/deals.
DO $$
BEGIN
  IF to_regclass('public.deals') IS NULL OR to_regclass('public.stages') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $sql$
    UPDATE public.contacts c
       SET lifecycle_stage = 'customer'
      FROM public.deals d
      JOIN public.stages s ON s.id::text = NULLIF(to_jsonb(d)->>'stage_id', '')
     WHERE NULLIF(to_jsonb(d)->>'contact_id', '') = c.id::text
       AND (
         s.name ILIKE '%ganho%'
         OR s.name ILIKE '%won%'
         OR s.name ILIKE '%fechamento%'
       )
       AND c.lifecycle_stage IN ('lead', 'mql', 'sql', 'opportunity')
  $sql$;

  EXECUTE $sql$
    UPDATE public.contacts c
       SET lifecycle_stage = 'opportunity'
      FROM public.deals d
      JOIN public.stages s ON s.id::text = NULLIF(to_jsonb(d)->>'stage_id', '')
     WHERE NULLIF(to_jsonb(d)->>'contact_id', '') = c.id::text
       AND s.name NOT ILIKE '%ganho%'
       AND s.name NOT ILIKE '%won%'
       AND s.name NOT ILIKE '%perdido%'
       AND s.name NOT ILIKE '%lost%'
       AND c.lifecycle_stage IN ('lead', 'mql', 'sql')
  $sql$;
END;
$$;

-- SQL backfill from existing interactions, when present.
DO $$
BEGIN
  IF to_regclass('public.interactions') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $sql$
    UPDATE public.contacts c
       SET lifecycle_stage = 'sql'
     WHERE c.lifecycle_stage = 'lead'
       AND EXISTS (
         SELECT 1
           FROM public.interactions i
          WHERE NULLIF(to_jsonb(i)->>'contact_id', '') = c.id::text
       )
  $sql$;
END;
$$;

-- SQL backfill from WhatsApp conversations, when present.
DO $$
BEGIN
  IF to_regclass('public.whatsapp_conversations') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $sql$
    UPDATE public.contacts c
       SET lifecycle_stage = 'sql'
     WHERE c.lifecycle_stage = 'lead'
       AND EXISTS (
         SELECT 1
           FROM public.whatsapp_conversations wc
          WHERE NULLIF(to_jsonb(wc)->>'contact_id', '') = c.id::text
       )
  $sql$;
END;
$$;

UPDATE public.contacts
   SET lifecycle_stage = 'lead'
 WHERE lifecycle_stage IS NULL
    OR BTRIM(lifecycle_stage) = '';

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_lifecycle_stage_check
  CHECK (lifecycle_stage IN (
    'subscriber', 'lead', 'mql', 'sql',
    'opportunity', 'customer', 'evangelist', 'disqualified'
  ));

ALTER TABLE public.contacts
  ALTER COLUMN lifecycle_stage SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_lifecycle_stage
  ON public.contacts (lifecycle_stage);
