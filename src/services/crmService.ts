import { supabase } from '@/lib/supabase';
import type { Contact, Company, Deal, Funnel, Profile } from '@/types';

// ── SELECT fragments ────────────────────────────────────────────────────────
const CONTACT_SELECT = '*, company:companies(id, name), owner:profiles(id, name)';
const COMPANY_SELECT = '*, owner:profiles(id, name)';
const DEAL_SELECT    = '*, funnel:funnels(id, name), contact:contacts(id, name), company:companies(id, name), owner:profiles(id, name)';

// ── Helpers ─────────────────────────────────────────────────────────────────
function throwOnError<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

// ── Profiles ─────────────────────────────────────────────────────────────────
export async function getProfiles(): Promise<Pick<Profile, 'id' | 'name'>[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name')
    .order('name');
  if (error) throw error;
  return data ?? [];
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
  if (params.stage)  q = q.eq('stage', params.stage);
  if (params.ownerId) q = q.eq('owner_id', params.ownerId);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Deal[];
}

export async function createDeal(payload: Omit<Deal, 'id' | 'created_at' | 'funnel' | 'contact' | 'company' | 'owner'>): Promise<Deal> {
  return throwOnError(
    await supabase.from('deals').insert(payload).select(DEAL_SELECT).single()
  ) as Deal;
}

export async function updateDeal(id: string, payload: Partial<Omit<Deal, 'id' | 'created_at' | 'funnel' | 'contact' | 'company' | 'owner'>>): Promise<Deal> {
  return throwOnError(
    await supabase.from('deals').update(payload).eq('id', id).select(DEAL_SELECT).single()
  ) as Deal;
}

export async function deleteDeal(id: string): Promise<void> {
  const { error } = await supabase.from('deals').delete().eq('id', id);
  if (error) throw error;
}
