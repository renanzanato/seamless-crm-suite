import { supabase } from '@/lib/supabase';
import type { Activity } from '@/services/activitiesService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface InboxItem {
  id: string;
  kind: 'task' | 'inbound_msg' | 'cadence_followup' | 'hot_signal';
  title: string;
  subtitle: string;
  relativeTime: string;
  contactId?: string | null;
  companyId?: string | null;
  dealId?: string | null;
  activityId?: string | null;
  payload?: Record<string, unknown>;
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `ha ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `ha ${hours}h`;
  const days = Math.floor(hours / 24);
  return `ha ${days}d`;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Tasks atrasadas: kind='task', status='pending', due_date < today */
export async function getOverdueTasks(userId: string): Promise<InboxItem[]> {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('activities')
    .select('id, subject, occurred_at, contact_id, company_id, deal_id, payload, created_by')
    .eq('kind', 'task')
    .eq('created_by', userId)
    .lt('payload->>due_date', today)
    .order('occurred_at', { ascending: false })
    .limit(50);
  if (error) throw error;

  return (data ?? [])
    .filter((r) => (r.payload as Record<string, unknown>)?.status === 'pending')
    .map((r) => ({
      id: r.id,
      kind: 'task' as const,
      title: r.subject ?? 'Tarefa',
      subtitle: timeAgo(r.occurred_at),
      relativeTime: timeAgo(r.occurred_at),
      contactId: r.contact_id,
      companyId: r.company_id,
      dealId: r.deal_id,
      activityId: r.id,
      payload: r.payload as Record<string, unknown>,
    }));
}

/** Tasks de hoje: kind='task', status='pending', due_date = today */
export async function getTodayTasks(userId: string): Promise<InboxItem[]> {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('activities')
    .select('id, subject, occurred_at, contact_id, company_id, deal_id, payload, created_by')
    .eq('kind', 'task')
    .eq('created_by', userId)
    .order('occurred_at', { ascending: false })
    .limit(100);
  if (error) throw error;

  return (data ?? [])
    .filter((r) => {
      const p = r.payload as Record<string, unknown>;
      return p?.status === 'pending' && p?.due_date === today;
    })
    .map((r) => ({
      id: r.id,
      kind: 'task' as const,
      title: r.subject ?? 'Tarefa',
      subtitle: 'Vence hoje',
      relativeTime: timeAgo(r.occurred_at),
      contactId: r.contact_id,
      companyId: r.company_id,
      dealId: r.deal_id,
      activityId: r.id,
      payload: r.payload as Record<string, unknown>,
    }));
}

/** Inbound sem resposta: ultima activity do contato e direction='in' nas ultimas 48h */
export async function getUnrepliedInbound(): Promise<InboxItem[]> {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('activities')
    .select('id, kind, subject, body, occurred_at, contact_id, company_id, direction')
    .in('kind', ['whatsapp', 'email'])
    .eq('direction', 'in')
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: false })
    .limit(50);
  if (error) throw error;

  return (data ?? []).map((r) => ({
    id: r.id,
    kind: 'inbound_msg' as const,
    title: r.subject ?? (r.kind === 'whatsapp' ? 'WhatsApp recebido' : 'Email recebido'),
    subtitle: (r.body ?? '').slice(0, 60) || 'Mensagem recebida',
    relativeTime: timeAgo(r.occurred_at),
    contactId: r.contact_id,
    companyId: r.company_id,
    activityId: r.id,
  }));
}

/** Follow-ups de cadencia que vencem hoje */
export async function getCadenceFollowups(userId: string): Promise<InboxItem[]> {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('daily_tasks')
    .select('id, task_type, due_date, company_id, contact_id, generated_message, company:companies(name), contact:contacts(name)')
    .eq('status', 'pending')
    .eq('due_date', today)
    .limit(50);
  if (error) {
    // Table might not exist - graceful fallback
    console.warn('[inboxService] daily_tasks query failed:', error.message);
    return [];
  }

  return (data ?? []).map((r) => ({
    id: r.id,
    kind: 'cadence_followup' as const,
    title: `${r.task_type}: ${(r.company as { name: string } | null)?.name ?? 'Empresa'}`,
    subtitle: (r.contact as { name: string } | null)?.name ?? 'Follow-up de cadencia',
    relativeTime: 'Hoje',
    contactId: r.contact_id,
    companyId: r.company_id,
  }));
}

/** Sinais quentes ABM: account_signals recentes com confidence > 0.7 */
export async function getHotSignals(): Promise<InboxItem[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('account_signals')
    .select('id, signal_type, description, detected_at, company_id, confidence, company:companies(name)')
    .gte('detected_at', since)
    .gte('confidence', 0.7)
    .order('detected_at', { ascending: false })
    .limit(20);
  if (error) {
    console.warn('[inboxService] account_signals query failed:', error.message);
    return [];
  }

  return (data ?? []).map((r) => ({
    id: r.id,
    kind: 'hot_signal' as const,
    title: r.signal_type ?? 'Sinal detectado',
    subtitle: `${(r.company as { name: string } | null)?.name ?? 'Empresa'} - ${r.description ?? ''}`.trim(),
    relativeTime: timeAgo(r.detected_at),
    companyId: r.company_id,
  }));
}

/** Total count for sidebar badge */
export async function getInboxCount(userId: string): Promise<number> {
  try {
    const [overdue, today, inbound] = await Promise.all([
      getOverdueTasks(userId),
      getTodayTasks(userId),
      getUnrepliedInbound(),
    ]);
    return overdue.length + today.length + inbound.length;
  } catch {
    return 0;
  }
}
