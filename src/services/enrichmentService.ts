import { supabase } from '@/lib/supabase';

export type EnrichmentStatus = 'pending' | 'enriching' | 'done' | 'error';

export interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  city: string | null;
  segment: string | null;
  responsible_id: string | null;
  stage: string;
  created_at: string;
  enrichment_status?: EnrichmentStatus;
}

export interface EnrichmentLog {
  id: string;
  contact_id: string;
  status: EnrichmentStatus;
  fields_updated: Record<string, unknown> | null;
  enriched_at: string;
}

export async function fetchContacts(): Promise<Contact[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Busca último status de enriquecimento por contato
  const ids = (data as Contact[]).map((c) => c.id);
  if (ids.length === 0) return data as Contact[];

  const { data: logs } = await supabase
    .from('enrichment_logs')
    .select('contact_id, status')
    .in('contact_id', ids)
    .order('enriched_at', { ascending: false });

  const latestStatus: Record<string, EnrichmentStatus> = {};
  for (const log of logs ?? []) {
    if (!latestStatus[log.contact_id]) {
      latestStatus[log.contact_id] = log.status as EnrichmentStatus;
    }
  }

  return (data as Contact[]).map((c) => ({
    ...c,
    enrichment_status: latestStatus[c.id] ?? 'pending',
  }));
}

export async function startEnrichment(contactIds: string[]): Promise<void> {
  if (contactIds.length === 0) return;

  // Marca como "enriching" imediatamente
  const now = new Date().toISOString();
  const logRows = contactIds.map((id) => ({
    contact_id: id,
    status: 'enriching' as EnrichmentStatus,
    enriched_at: now,
  }));
  await supabase.from('enrichment_logs').insert(logRows);

  // Busca URL do webhook n8n configurado
  const { data: integration } = await supabase
    .from('integrations')
    .select('webhook_url, status')
    .eq('name', 'n8n')
    .single();

  if (!integration?.webhook_url || integration.status !== 'connected') {
    // Sem n8n configurado: marca como erro
    const errorRows = contactIds.map((id) => ({
      contact_id: id,
      status: 'error' as EnrichmentStatus,
      fields_updated: { error: 'n8n webhook não configurado' },
      enriched_at: new Date().toISOString(),
    }));
    await supabase.from('enrichment_logs').insert(errorRows);
    throw new Error('Integração n8n não configurada. Configure o webhook antes de enriquecer.');
  }

  // Busca dados dos contatos selecionados
  const { data: contacts } = await supabase
    .from('contacts')
    .select('*')
    .in('id', contactIds);

  // POST para o n8n
  const response = await fetch(integration.webhook_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contacts }),
  });

  if (!response.ok) {
    const errorRows = contactIds.map((id) => ({
      contact_id: id,
      status: 'error' as EnrichmentStatus,
      fields_updated: { error: `n8n retornou ${response.status}` },
      enriched_at: new Date().toISOString(),
    }));
    await supabase.from('enrichment_logs').insert(errorRows);
    throw new Error(`Erro ao chamar n8n: ${response.statusText}`);
  }

  // O n8n deve chamar de volta via webhook para atualizar os contatos.
  // Aqui marcamos como "done" localmente para feedback imediato.
  const doneRows = contactIds.map((id) => ({
    contact_id: id,
    status: 'done' as EnrichmentStatus,
    enriched_at: new Date().toISOString(),
  }));
  await supabase.from('enrichment_logs').insert(doneRows);
}

export async function fetchEnrichmentLogs(contactId: string): Promise<EnrichmentLog[]> {
  const { data, error } = await supabase
    .from('enrichment_logs')
    .select('*')
    .eq('contact_id', contactId)
    .order('enriched_at', { ascending: false });

  if (error) throw error;
  return data as EnrichmentLog[];
}

export async function bulkAssignResponsible(
  contactIds: string[],
  responsibleId: string,
): Promise<void> {
  const { error } = await supabase
    .from('contacts')
    .update({ responsible_id: responsibleId, updated_at: new Date().toISOString() })
    .in('id', contactIds);

  if (error) throw error;
}

export async function bulkMoveStage(contactIds: string[], stage: string): Promise<void> {
  const { error } = await supabase
    .from('contacts')
    .update({ stage, updated_at: new Date().toISOString() })
    .in('id', contactIds);

  if (error) throw error;
}