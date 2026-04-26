-- Onda 2: Tabela de listas salvas
-- Idempotente: IF NOT EXISTS em tudo

CREATE TABLE IF NOT EXISTS public.lists (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name       text NOT NULL,
  entity     text NOT NULL CHECK (entity IN ('contacts', 'companies', 'deals')),
  filters    jsonb NOT NULL DEFAULT '[]'::jsonb,
  columns    jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'lists' AND policyname = 'lists_owner_select'
  ) THEN
    CREATE POLICY lists_owner_select ON public.lists
      FOR SELECT USING (owner_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'lists' AND policyname = 'lists_owner_insert'
  ) THEN
    CREATE POLICY lists_owner_insert ON public.lists
      FOR INSERT WITH CHECK (owner_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'lists' AND policyname = 'lists_owner_update'
  ) THEN
    CREATE POLICY lists_owner_update ON public.lists
      FOR UPDATE USING (owner_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'lists' AND policyname = 'lists_owner_delete'
  ) THEN
    CREATE POLICY lists_owner_delete ON public.lists
      FOR DELETE USING (owner_id = auth.uid());
  END IF;
END $$;

-- Indice por entity + owner para queries frequentes
CREATE INDEX IF NOT EXISTS idx_lists_entity_owner ON public.lists (entity, owner_id);
