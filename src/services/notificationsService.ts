import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationKind =
  | 'mention'
  | 'lead_replied'
  | 'task_due_soon'
  | 'sequence_replied'
  | 'deal_stage_change'
  | 'signal_hot'
  | 'system';

export interface Notification {
  id: string;
  recipient_id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getNotifications(limit = 30): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Notification[];
}

export async function getUnreadCount(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

export async function markAsRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId);
  if (error) throw error;
}

export async function markAllAsRead(): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export interface NotificationPreference {
  id: string;
  user_id: string;
  kind: string;
  in_app: boolean;
  email: boolean;
}

export async function getPreferences(): Promise<NotificationPreference[]> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*');
  if (error) throw error;
  return (data ?? []) as NotificationPreference[];
}

export async function upsertPreference(
  kind: string,
  inApp: boolean,
  email: boolean,
): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('notification_preferences')
    .upsert(
      { user_id: userId, kind, in_app: inApp, email },
      { onConflict: 'user_id,kind' },
    );
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Icons / Labels
// ---------------------------------------------------------------------------

export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  mention: 'Menções',
  lead_replied: 'Respostas de leads',
  task_due_soon: 'Tarefas próximas',
  sequence_replied: 'Respostas de sequência',
  deal_stage_change: 'Mudança de estágio',
  signal_hot: 'Sinais quentes',
  system: 'Sistema',
};
