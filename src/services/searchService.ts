import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SearchResultType = 'contact' | 'company' | 'deal';

export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle: string | null;
  link: string;
}

interface DealSearchRow {
  id: string;
  title: string;
  value: number | null;
  stage_ref?: { name: string | null } | null;
}

async function searchDeals(term: string): Promise<DealSearchRow[]> {
  const stageId = await supabase
    .from('deals')
    .select('id, title, value, stage_ref:stages(name)')
    .or(`title.ilike.${term}`)
    .limit(8);

  if (stageId.error) {
    console.warn('[searchService] deal search unavailable:', stageId.error.message);
    return [];
  }

  return (stageId.data ?? []) as DealSearchRow[];
}

// ---------------------------------------------------------------------------
// Multi-entity search
// ---------------------------------------------------------------------------

export async function globalSearch(query: string): Promise<SearchResult[]> {
  if (!query || query.length < 2) return [];

  const term = `%${query}%`;

  // Parallel queries across entities
  const [contacts, companies, deals] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, name, email, role')
      .or(`name.ilike.${term},email.ilike.${term}`)
      .limit(8),
    supabase
      .from('companies')
      .select('id, name, city, segment')
      .or(`name.ilike.${term},city.ilike.${term}`)
      .limit(8),
    searchDeals(term),
  ]);

  const results: SearchResult[] = [];

  (contacts.data ?? []).forEach((c) =>
    results.push({
      id: c.id,
      type: 'contact',
      title: c.name,
      subtitle: [c.role, c.email].filter(Boolean).join(' · '),
      link: `/crm/contatos/${c.id}`,
    }),
  );

  (companies.data ?? []).forEach((c) =>
    results.push({
      id: c.id,
      type: 'company',
      title: c.name,
      subtitle: [c.segment, c.city].filter(Boolean).join(' · '),
      link: `/crm/empresas/${c.id}`,
    }),
  );

  deals.forEach((d) =>
    results.push({
      id: d.id,
      type: 'deal',
      title: d.title,
      subtitle: [d.stage_ref?.name, d.value ? `R$ ${d.value.toLocaleString('pt-BR')}` : null]
        .filter(Boolean)
        .join(' · '),
      link: `/crm/negocios/${d.id}`,
    }),
  );

  return results;
}
