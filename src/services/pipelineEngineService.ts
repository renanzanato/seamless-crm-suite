import { supabase } from '@/lib/supabase';
import type { DealContact, BuyingRole, DealStateSnapshot } from '@/types';

// ── Deal Contacts (Buying Committee) ──────────────────────

export async function getDealContacts(dealId: string): Promise<DealContact[]> {
  const { data, error } = await supabase
    .from('deal_contacts')
    .select('*, contact:contacts(id, name, role, email, whatsapp)')
    .eq('deal_id', dealId)
    .is('removed_at', null)
    .order('added_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as DealContact[];
}

export async function addDealContact(
  dealId: string,
  contactId: string,
  buyingRole: BuyingRole,
): Promise<DealContact> {
  const { data, error } = await supabase
    .from('deal_contacts')
    .upsert(
      { deal_id: dealId, contact_id: contactId, buying_role: buyingRole },
      { onConflict: 'deal_id,contact_id' },
    )
    .select('*, contact:contacts(id, name, role, email, whatsapp)')
    .single();
  if (error) throw error;
  return data as unknown as DealContact;
}

export async function updateDealContactRole(
  id: string,
  buyingRole: BuyingRole,
): Promise<void> {
  const { error } = await supabase
    .from('deal_contacts')
    .update({ buying_role: buyingRole })
    .eq('id', id);
  if (error) throw error;
}

export async function removeDealContact(id: string): Promise<void> {
  const { error } = await supabase
    .from('deal_contacts')
    .update({ removed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ── Deal State Snapshots ──────────────────────────────────

export async function getDealSnapshots(
  dealId: string,
  limit = 30,
): Promise<DealStateSnapshot[]> {
  const { data, error } = await supabase
    .from('deal_state_snapshots')
    .select('*')
    .eq('deal_id', dealId)
    .order('snapshot_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as DealStateSnapshot[];
}

export async function getSnapshotsByDate(
  date: string,
): Promise<DealStateSnapshot[]> {
  const { data, error } = await supabase
    .from('deal_state_snapshots')
    .select('*')
    .eq('snapshot_date', date)
    .order('value_brl', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DealStateSnapshot[];
}

// ── Pipeline Compare ──────────────────────────────────────

export interface PipelineCompareResult {
  entered: DealStateSnapshot[];
  exited: DealStateSnapshot[];
  stageChanged: Array<{ deal_id: string; from: string | null; to: string | null }>;
  valueChanged: Array<{ deal_id: string; from: number | null; to: number | null }>;
}

export async function comparePipelineDates(
  dateA: string,
  dateB: string,
): Promise<PipelineCompareResult> {
  const [snapA, snapB] = await Promise.all([
    getSnapshotsByDate(dateA),
    getSnapshotsByDate(dateB),
  ]);

  const mapA = new Map(snapA.map((s) => [s.deal_id, s]));
  const mapB = new Map(snapB.map((s) => [s.deal_id, s]));

  const entered = snapB.filter((s) => !mapA.has(s.deal_id));
  const exited = snapA.filter((s) => !mapB.has(s.deal_id));

  const stageChanged: PipelineCompareResult['stageChanged'] = [];
  const valueChanged: PipelineCompareResult['valueChanged'] = [];

  for (const [dealId, b] of mapB) {
    const a = mapA.get(dealId);
    if (!a) continue;
    if (a.stage !== b.stage) stageChanged.push({ deal_id: dealId, from: a.stage, to: b.stage });
    if (a.value_brl !== b.value_brl) valueChanged.push({ deal_id: dealId, from: a.value_brl, to: b.value_brl });
  }

  return { entered, exited, stageChanged, valueChanged };
}
