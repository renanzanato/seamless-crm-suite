import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmailAccount {
  id: string;
  owner_id: string;
  provider: 'gmail' | 'outlook';
  email_address: string;
  status: 'active' | 'expired' | 'revoked';
  connected_at: string;
}

export interface EmailTracking {
  id: string;
  message_id: string | null;
  thread_id: string | null;
  account_id: string | null;
  contact_id: string | null;
  direction: 'in' | 'out';
  subject: string | null;
  body_preview: string | null;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  replied_at: string | null;
  error_msg: string | null;
}

export interface SendEmailParams {
  accountId: string;
  to: string;
  subject: string;
  body: string;
  html?: string;
  replyTo?: string;
  contactId?: string;
}

// ---------------------------------------------------------------------------
// Email accounts CRUD
// ---------------------------------------------------------------------------

export async function getMyEmailAccounts(): Promise<EmailAccount[]> {
  const { data, error } = await supabase
    .from('email_accounts')
    .select('id, owner_id, provider, email_address, status, connected_at')
    .order('connected_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as EmailAccount[];
}

export async function disconnectEmailAccount(accountId: string): Promise<void> {
  const { error } = await supabase
    .from('email_accounts')
    .update({ status: 'revoked' })
    .eq('id', accountId);
  if (error) throw error;
}

export async function deleteEmailAccount(accountId: string): Promise<void> {
  const { error } = await supabase
    .from('email_accounts')
    .delete()
    .eq('id', accountId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// OAuth URL builders (redirect to Edge Function)
// ---------------------------------------------------------------------------

function getSupabaseUrl(): string {
  // Use the Supabase project URL
  return import.meta.env.VITE_SUPABASE_URL ?? '';
}

export function getGmailOAuthUrl(): string {
  return `${getSupabaseUrl()}/functions/v1/oauth-callback?provider=gmail`;
}

export function getOutlookOAuthUrl(): string {
  return `${getSupabaseUrl()}/functions/v1/oauth-callback?provider=outlook`;
}

// ---------------------------------------------------------------------------
// Send email via Edge Function
// ---------------------------------------------------------------------------

export async function sendEmail(params: SendEmailParams): Promise<{
  messageId: string | null;
  trackingId: string | null;
}> {
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;

  const res = await fetch(`${getSupabaseUrl()}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Falha ao enviar email' }));
    throw new Error(err.error ?? 'Falha ao enviar email');
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Email tracking queries
// ---------------------------------------------------------------------------

export async function getEmailTrackingForContact(
  contactId: string,
): Promise<EmailTracking[]> {
  const { data, error } = await supabase
    .from('email_tracking')
    .select('*')
    .eq('contact_id', contactId)
    .order('sent_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as EmailTracking[];
}

export async function getRecentEmailTracking(limit = 20): Promise<EmailTracking[]> {
  const { data, error } = await supabase
    .from('email_tracking')
    .select('*')
    .order('sent_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as EmailTracking[];
}
