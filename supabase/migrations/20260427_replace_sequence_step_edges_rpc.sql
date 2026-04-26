-- Atomic replace for sequence step edges.
-- Wraps delete + insert in a single transaction so callers never lose edges
-- if the insert half fails.

CREATE OR REPLACE FUNCTION public.replace_sequence_step_edges(
  p_sequence_id uuid,
  p_edges jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  DELETE FROM public.sequence_step_edges WHERE sequence_id = p_sequence_id;
  IF jsonb_array_length(p_edges) > 0 THEN
    INSERT INTO public.sequence_step_edges
      (sequence_id, source_step_id, target_step_id, source_handle,
       target_handle, label, edge_type)
    SELECT
      p_sequence_id,
      (e->>'source_step_id')::uuid,
      (e->>'target_step_id')::uuid,
      NULLIF(e->>'source_handle', ''),
      NULLIF(e->>'target_handle', ''),
      NULLIF(e->>'label', ''),
      COALESCE(NULLIF(e->>'edge_type', ''), 'default')
    FROM jsonb_array_elements(p_edges) AS e;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_sequence_step_edges(uuid, jsonb)
  TO authenticated;
