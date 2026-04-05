import { supabase } from '@/lib/supabase';

export type IntegrationName =
  | 'apollo'
  | 'search_api'
  | 'n8n'
  | 'briary'
  | 'whatsapp'
  | 'email'
  | 'openai';

export type IntegrationStatus = 'connected' | 'disconnected' | 'error' | 'coming_soon';

export interface Integration {
  id: string;
  name: IntegrationName;
  api_key_encrypted: string | null;
  webhook_url: string | null;
  status: IntegrationStatus;
  configured_by: string | null;
  updated_at: string;
}

export interface WebhookLog {
  id: string;
  webhook_id: string;
  payload: Record<string, unknown>;
  received_at: string;
  status: 'received' | 'processed' | 'error';
}

export async function fetchIntegrations(): Promise<Integration[]> {
  const { data, error } = await supabase
    .from('integrations')
    .select('*')
    .order('name');

  if (error) throw error;
  return data as Integration[];
}

export async function saveIntegration(
  name: IntegrationName,
  apiKey: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('integrations')
    .update({
      api_key_encrypted: apiKey,
      status: 'connected',
      configured_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq('name', name);

  if (error) throw error;
}

export async function disconnectIntegration(name: IntegrationName): Promise<void> {
  const { error } = await supabase
    .from('integrations')
    .update({
      api_key_encrypted: null,
      status: 'disconnected',
      updated_at: new Date().toISOString(),
    })
    .eq('name', name);

  if (error) throw error;
}

/** Testa conexão simulando uma chamada — no futuro pode chamar Edge Function */
export async function testConnection(
  name: IntegrationName,
  apiKey: string,
): Promise<{ ok: boolean; message: string }> {
  if (!apiKey.trim()) {
    return { ok: false, message: 'Informe a API key antes de testar.' };
  }
  // Simulação: aceita qualquer chave com pelo menos 20 chars
  await new Promise((r) => setTimeout(r, 1200));
  if (apiKey.length >= 20) {
    return { ok: true, message: `Conexão com ${name} estabelecida com sucesso.` };
  }
  return { ok: false, message: 'API key inválida ou sem permissões suficientes.' };
}

/** Gera a URL de webhook n8n para este workspace, usando o id da integração */
export function buildWebhookUrl(integrationId: string): string {
  const base = import.meta.env.VITE_SUPABASE_URL ?? 'https://your-project.supabase.co';
  return `${base}/functions/v1/n8n-webhook/${integrationId}`;
}

export async function saveWebhookUrl(integrationId: string, url: string): Promise<void> {
  const { error } = await supabase
    .from('integrations')
    .update({ webhook_url: url, updated_at: new Date().toISOString() })
    .eq('id', integrationId);

  if (error) throw error;
}

export async function fetchWebhookLogs(integrationId: string): Promise<WebhookLog[]> {
  const { data, error } = await supabase
    .from('webhook_logs')
    .select('*')
    .eq('webhook_id', integrationId)
    .order('received_at', { ascending: false })
    .limit(10);

  if (error) throw error;
  return data as WebhookLog[];
}