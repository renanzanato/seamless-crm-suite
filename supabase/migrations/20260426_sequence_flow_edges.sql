-- Onda 2.1: persist ReactFlow layout and edges for SequenceBuilderV2.
-- sequence_steps_v2 is the node table; sequence_step_edges stores executable links.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sequence_steps_v2'
      AND column_name = 'flow_position'
  ) THEN
    ALTER TABLE public.sequence_steps_v2
      ADD COLUMN flow_position jsonb NOT NULL DEFAULT '{"x":250,"y":0}'::jsonb;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.sequence_step_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.sequences(id) ON DELETE CASCADE,
  source_step_id uuid NOT NULL REFERENCES public.sequence_steps_v2(id) ON DELETE CASCADE,
  target_step_id uuid NOT NULL REFERENCES public.sequence_steps_v2(id) ON DELETE CASCADE,
  source_handle text,
  target_handle text,
  label text,
  edge_type text NOT NULL DEFAULT 'default',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sequence_step_edges_no_self_loop CHECK (source_step_id <> target_step_id)
);

CREATE INDEX IF NOT EXISTS sequence_step_edges_sequence_idx
  ON public.sequence_step_edges (sequence_id);

CREATE INDEX IF NOT EXISTS sequence_step_edges_source_idx
  ON public.sequence_step_edges (source_step_id);

CREATE INDEX IF NOT EXISTS sequence_step_edges_target_idx
  ON public.sequence_step_edges (target_step_id);

CREATE UNIQUE INDEX IF NOT EXISTS sequence_step_edges_unique_link_idx
  ON public.sequence_step_edges (
    sequence_id,
    source_step_id,
    coalesce(source_handle, ''),
    target_step_id,
    coalesce(target_handle, '')
  );

ALTER TABLE public.sequence_step_edges ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sequence_step_edges'
      AND policyname = 'sequence_step_edges_auth_select'
  ) THEN
    CREATE POLICY sequence_step_edges_auth_select
      ON public.sequence_step_edges
      FOR SELECT
      USING (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sequence_step_edges'
      AND policyname = 'sequence_step_edges_auth_insert'
  ) THEN
    CREATE POLICY sequence_step_edges_auth_insert
      ON public.sequence_step_edges
      FOR INSERT
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sequence_step_edges'
      AND policyname = 'sequence_step_edges_auth_update'
  ) THEN
    CREATE POLICY sequence_step_edges_auth_update
      ON public.sequence_step_edges
      FOR UPDATE
      USING (auth.uid() IS NOT NULL)
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sequence_step_edges'
      AND policyname = 'sequence_step_edges_auth_delete'
  ) THEN
    CREATE POLICY sequence_step_edges_auth_delete
      ON public.sequence_step_edges
      FOR DELETE
      USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

