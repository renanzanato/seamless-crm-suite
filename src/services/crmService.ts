import { supabase } from '@/lib/supabase';
import type { BuyingSignal, CompanyStatus, Contact, Company, Deal, Funnel, Profile } from '@/types';

// ── SELECT fragments ────────────────────────────────────────────────────────
const CONTACT_SELECT = '*, company:companies(id, name), owner:profiles(id, name)';
const COMPANY_SELECT = '*, owner:profiles(id, name)';
const DEAL_SELECT    = 'id, title, value, stage_id, funnel_id, contact_id, company_id, owner_id, expected_close, created_at, custom_data, stage_ref:stages(id, name, color, order), funnel:funnels(id, name), contact:contacts(id, name, email, whatsapp, phone, role), company:companies(id, name, city, segment, buying_signal), owner:profiles(id, name)';

// ── Helpers ─────────────────────────────────────────────────────────────────
function throwOnError<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

type DealStageRef = { id: string; name: string; color?: string | null; order?: number | null } | null;
type DealRow = Omit<Deal, 'stage' | 'stage_ref'> & { stage_ref?: DealStageRef };

function normalizeDeal(row: DealRow): Deal {
  return {
    ...row,
    stage: row.stage_ref?.name ?? 'Qualificação',
    stage_ref: row.stage_ref ?? null,
  };
}

async function resolveStageIdByName(stageName: string, funnelId?: string | null): Promise<string | null> {
  let query = supabase
    .from('stages')
    .select('id')
    .eq('name', stageName)
    .limit(1);

  if (funnelId) query = query.eq('funnel_id', funnelId);

  const initial = await query.maybeSingle();
  let data = initial.data;
  if (initial.error) throw initial.error;
  if (data?.id) return data.id;

  if (funnelId) {
    const fallback = await supabase
      .from('stages')
      .select('id')
      .eq('name', stageName)
      .limit(1)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    data = fallback.data;
  }

  return data?.id ?? null;
}

async function prepareDealPayload(
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const next = { ...payload };
  const stageName = typeof next.stage === 'string' ? next.stage : null;
  if (stageName && !next.stage_id) {
    next.stage_id = await resolveStageIdByName(
      stageName,
      typeof next.funnel_id === 'string' ? next.funnel_id : null,
    );
  }
  delete next.stage;
  delete next.stage_ref;
  delete next.funnel;
  delete next.contact;
  delete next.company;
  delete next.owner;
  return next;
}

// ── Profiles ─────────────────────────────────────────────────────────────────
export async function getProfiles(): Promise<Pick<Profile, 'id' | 'name' | 'email'>[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email')
    .order('name', { nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}

/** Retorna um label legível pra um profile mesmo quando `name` é NULL. */
export function profileLabel(p: { name?: string | null; email?: string | null; id?: string | null }): string {
  if (p.name && p.name.trim()) return p.name;
  if (p.email && p.email.trim()) return p.email.split('@')[0];
  return p.id ? `Usuário ${p.id.slice(0, 8)}` : 'Usuário sem nome';
}

// ── Funnels ──────────────────────────────────────────────────────────────────
export async function getFunnels(): Promise<Funnel[]> {
  const { data, error } = await supabase
    .from('funnels')
    .select('*')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

// ── Companies ────────────────────────────────────────────────────────────────
export async function getCompanies(params: { search?: string; ownerId?: string } = {}): Promise<Company[]> {
  let q = supabase.from('companies').select(COMPANY_SELECT).order('name');

  if (params.search) q = q.ilike('name', `%${params.search}%`);
  if (params.ownerId) q = q.eq('owner_id', params.ownerId);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Company[];
}

export type CompanySortKey = 'name' | 'icp_score' | 'vgv_projected' | 'monthly_media_spend' | 'created_at';

export interface CompaniesPageParams {
  search?: string;
  ownerId?: string;
  signal?: string;
  launch?: 'active' | 'upcoming';
  status?: string;
  city?: string;
  segment?: string;
  state?: string;
  page?: number;
  pageSize?: number;
  sortBy?: CompanySortKey;
  ascending?: boolean;
}

export interface CompaniesPageResult {
  data: Company[];
  count: number;
}

export async function getCompaniesPage(params: CompaniesPageParams = {}): Promise<CompaniesPageResult> {
  const pageSize = params.pageSize ?? 25;
  const page = Math.max(params.page ?? 1, 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const sortBy = params.sortBy ?? 'name';

  let q = supabase
    .from('companies')
    .select(COMPANY_SELECT, { count: 'exact' });

  if (params.search) {
    const term = params.search.replace(/[%,]/g, '').trim();
    if (term) q = q.or(`name.ilike.%${term}%,city.ilike.%${term}%,segment.ilike.%${term}%`);
  }
  if (params.ownerId) q = q.eq('owner_id', params.ownerId);
  if (params.signal && params.signal !== '__all__') q = q.eq('buying_signal', params.signal);
  if (params.status && params.status !== '__all__') q = q.eq('status', params.status);
  if (params.launch === 'active') q = q.eq('has_active_launch', true);
  if (params.launch === 'upcoming') q = q.eq('upcoming_launch', true);
  if (params.city && params.city !== '__all__') q = q.eq('city', params.city);
  if (params.segment && params.segment !== '__all__') q = q.eq('segment', params.segment);
  if (params.state && params.state !== '__all__') q = q.eq('state', params.state);

  const { data, error, count } = await q
    .order(sortBy, { ascending: params.ascending ?? sortBy === 'name' })
    .range(from, to);
  if (error) throw error;
  return { data: (data ?? []) as Company[], count: count ?? 0 };
}

export async function getCompanyFilterOptions(): Promise<{
  cities: string[];
  states: string[];
  segments: string[];
}> {
  const { data, error } = await supabase
    .from('companies')
    .select('city, state, segment')
    .order('city');
  if (error) throw error;
  const rows = data ?? [];
  const unique = <T>(arr: (T | null | undefined)[]) =>
    [...new Set(arr.filter((v): v is T => v != null && v !== ''))].sort() as T[];
  return {
    cities: unique(rows.map((r) => r.city)),
    states: unique(rows.map((r) => r.state)),
    segments: unique(rows.map((r) => r.segment)),
  };
}

export async function createCompany(payload: Omit<Company, 'id' | 'created_at' | 'owner'>): Promise<Company> {
  return throwOnError(
    await supabase.from('companies').insert(payload).select(COMPANY_SELECT).single()
  ) as Company;
}

export async function updateCompany(id: string, payload: Partial<Omit<Company, 'id' | 'created_at' | 'owner'>>): Promise<Company> {
  return throwOnError(
    await supabase.from('companies').update(payload).eq('id', id).select(COMPANY_SELECT).single()
  ) as Company;
}

export async function deleteCompany(id: string): Promise<void> {
  const { error } = await supabase.from('companies').delete().eq('id', id);
  if (error) throw error;
}

// ── Contacts ─────────────────────────────────────────────────────────────────
export async function getContacts(params: { search?: string; ownerId?: string } = {}): Promise<Contact[]> {
  let q = supabase.from('contacts').select(CONTACT_SELECT).order('name');

  if (params.search) {
    q = q.or(`name.ilike.%${params.search}%,email.ilike.%${params.search}%`);
  }
  if (params.ownerId) q = q.eq('owner_id', params.ownerId);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Contact[];
}

export async function getContact(id: string): Promise<Contact | null> {
  const { data, error } = await supabase
    .from('contacts')
    .select(CONTACT_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as Contact | null) ?? null;
}

export interface ContactCompanySummary {
  id: string;
  name: string;
  buying_signal: BuyingSignal | null;
  city: string | null;
  segment: string | null;
  status: CompanyStatus | null;
}

export interface ContactDealSummary {
  id: string;
  title: string;
  stage: string;
  stage_id: string | null;
  value: number | null;
  expected_close: string | null;
  company_id: string | null;
  contact_id: string | null;
}

export interface ContactSiblingSummary {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  whatsapp: string | null;
}

export interface ContactRelations {
  company: ContactCompanySummary | null;
  deals: ContactDealSummary[];
  siblings: ContactSiblingSummary[];
}

export async function getContactRelations(
  contactId: string,
  companyId: string | null,
): Promise<ContactRelations> {
  const companyQuery = companyId
    ? supabase
        .from('companies')
        .select('id, name, buying_signal, city, segment, status')
        .eq('id', companyId)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const dealsQuery = supabase
    .from('deals')
    .select('id, title, stage_id, value, expected_close, company_id, contact_id, stage_ref:stages(name)')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(10);

  const siblingsQuery = companyId
    ? supabase
        .from('contacts')
        .select('id, name, role, email, whatsapp')
        .eq('company_id', companyId)
        .neq('id', contactId)
        .order('name')
        .limit(12)
    : Promise.resolve({ data: [], error: null });

  const [companyRes, dealsRes, siblingsRes] = await Promise.all([
    companyQuery,
    dealsQuery,
    siblingsQuery,
  ]);

  if (companyRes.error) throw companyRes.error;
  if (dealsRes.error) throw dealsRes.error;
  if (siblingsRes.error) throw siblingsRes.error;

  return {
    company: (companyRes.data as ContactCompanySummary | null) ?? null,
    deals: ((dealsRes.data ?? []) as Array<ContactDealSummary & { stage_ref?: { name: string | null } | null }>).map((deal) => ({
      ...deal,
      stage: deal.stage_ref?.name ?? 'Qualificação',
    })),
    siblings: (siblingsRes.data ?? []) as ContactSiblingSummary[],
  };
}

export async function getContactsByCompany(companyId: string): Promise<Contact[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select(CONTACT_SELECT)
    .eq('company_id', companyId)
    .order('name');
  if (error) throw error;
  return (data ?? []) as Contact[];
}

export async function createContact(payload: Omit<Contact, 'id' | 'created_at' | 'company' | 'owner'>): Promise<Contact> {
  return throwOnError(
    await supabase.from('contacts').insert(payload).select(CONTACT_SELECT).single()
  ) as Contact;
}

export async function updateContact(id: string, payload: Partial<Omit<Contact, 'id' | 'created_at' | 'company' | 'owner'>>): Promise<Contact> {
  return throwOnError(
    await supabase.from('contacts').update(payload).eq('id', id).select(CONTACT_SELECT).single()
  ) as Contact;
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase.from('contacts').delete().eq('id', id);
  if (error) throw error;
}

// ── Bulk import (CSV) ─────────────────────────────────────────────────────────
export interface ImportResult {
  inserted: number;
  skipped: number;
  errors: string[];
}

export async function importContacts(
  rows: Omit<Contact, 'id' | 'created_at' | 'company' | 'owner'>[],
): Promise<ImportResult> {
  const result: ImportResult = { inserted: 0, skipped: 0, errors: [] };

  for (const row of rows) {
    const { error } = await supabase
      .from('contacts')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      // code 23505 = unique_violation (duplicate email)
      if ((error as { code?: string }).code === '23505') {
        result.skipped++;
      } else {
        result.errors.push(`${row.name}: ${error.message}`);
      }
    } else {
      result.inserted++;
    }
  }

  return result;
}

// ── Deals ─────────────────────────────────────────────────────────────────────
export async function getDeals(params: { search?: string; stage?: string; ownerId?: string } = {}): Promise<Deal[]> {
  let q = supabase.from('deals').select(DEAL_SELECT).order('created_at', { ascending: false });

  if (params.search) q = q.ilike('title', `%${params.search}%`);
  if (params.stage) {
    const stageId = await resolveStageIdByName(params.stage);
    if (!stageId) return [];
    q = q.eq('stage_id', stageId);
  }
  if (params.ownerId) q = q.eq('owner_id', params.ownerId);

  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as DealRow[]).map(normalizeDeal);
}

export async function getDeal(id: string): Promise<Deal | null> {
  const { data, error } = await supabase
    .from('deals')
    .select(DEAL_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeDeal(data as unknown as DealRow) : null;
}

export async function createDeal(payload: Omit<Deal, 'id' | 'created_at' | 'funnel' | 'contact' | 'company' | 'owner'>): Promise<Deal> {
  const prepared = await prepareDealPayload(payload as unknown as Record<string, unknown>);
  const row = throwOnError(
    await supabase.from('deals').insert(prepared).select(DEAL_SELECT).single()
  ) as unknown as DealRow;
  return normalizeDeal(row);
}

export async function updateDeal(id: string, payload: Partial<Omit<Deal, 'id' | 'created_at' | 'funnel' | 'contact' | 'company' | 'owner'>>): Promise<Deal> {
  const prepared = await prepareDealPayload(payload as unknown as Record<string, unknown>);
  const row = throwOnError(
    await supabase.from('deals').update(prepared).eq('id', id).select(DEAL_SELECT).single()
  ) as unknown as DealRow;
  return normalizeDeal(row);
}

export async function deleteDeal(id: string): Promise<void> {
  const { error } = await supabase.from('deals').delete().eq('id', id);
  if (error) throw error;
}
