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
    supabase
      .from('deals')
      .select('id, title, stage, value')
      .or(`title.ilike.${term}`)
      .limit(8),
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

  (deals.data ?? []).forEach((d) =>
    results.push({
      id: d.id,
      type: 'deal',
      title: d.title,
      subtitle: [d.stage, d.value ? `R$ ${d.value.toLocaleString('pt-BR')}` : null]
        .filter(Boolean)
        .join(' · '),
      link: `/crm/negocios/${d.id}`,
    }),
  );

  return results;
}
