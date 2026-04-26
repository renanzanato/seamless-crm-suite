import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface SavedList {
  id: string;
  owner_id: string;
  name: string;
  entity: 'contacts' | 'companies' | 'deals';
  filters: unknown; // JSON — FilterGroup serialized
  columns: string[] | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
export async function getSavedLists(entity: SavedList['entity']): Promise<SavedList[]> {
  const { data, error } = await supabase
    .from('lists')
    .select('*')
    .eq('entity', entity)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SavedList[];
}

export async function createSavedList(
  payload: Pick<SavedList, 'name' | 'entity' | 'filters' | 'columns'> & { owner_id: string },
): Promise<SavedList> {
  const { data, error } = await supabase
    .from('lists')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as SavedList;
}

export async function deleteSavedList(id: string): Promise<void> {
  const { error } = await supabase.from('lists').delete().eq('id', id);
  if (error) throw error;
}
