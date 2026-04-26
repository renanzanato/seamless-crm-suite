import { supabase } from '@/lib/supabase';
import type { Role } from '@/types';

export type SettingsRole = 'admin' | 'manager' | 'rep' | 'viewer';
export const SETTINGS_ROLES: SettingsRole[] = ['admin', 'manager', 'rep', 'viewer'];

export interface SettingsProfile {
  id: string;
  name: string | null;
  email: string | null;
  role: Role;
  team_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string | null;
}

export interface InviteProfileInput {
  name?: string | null;
  email: string;
  role: SettingsRole;
}

export type CustomFieldEntity = 'contacts' | 'companies' | 'deals';
export type CustomFieldType = 'text' | 'number' | 'date' | 'enum' | 'boolean';

export const CUSTOM_FIELD_ENTITIES: CustomFieldEntity[] = ['contacts', 'companies', 'deals'];
export const CUSTOM_FIELD_TYPES: CustomFieldType[] = ['text', 'number', 'date', 'enum', 'boolean'];

export interface CustomField {
  id: string;
  entity: CustomFieldEntity;
  field_name: string;
  field_type: CustomFieldType;
  options: string[];
  is_required: boolean;
  order: number;
  created_by: string | null;
  created_at: string;
  updated_at?: string | null;
}

export type MessageTemplateChannel = 'whatsapp' | 'email' | 'linkedin';
export const MESSAGE_TEMPLATE_CHANNELS: MessageTemplateChannel[] = ['whatsapp', 'email', 'linkedin'];

export interface MessageTemplate {
  id: string;
  owner_id: string;
  name: string;
  channel: MessageTemplateChannel;
  body: string;
  variables: string[];
  created_at: string;
  updated_at?: string | null;
}

function throwIfError(error: unknown) {
  if (error) throw error;
}

function mapCustomField(row: Record<string, unknown>): CustomField {
  const options = Array.isArray(row.options)
    ? row.options.filter((item): item is string => typeof item === 'string')
    : [];

  return {
    id: String(row.id),
    entity: row.entity as CustomFieldEntity,
    field_name: String(row.field_name ?? ''),
    field_type: row.field_type as CustomFieldType,
    options,
    is_required: Boolean(row.is_required),
    order: Number(row.order ?? 0),
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: (row.updated_at as string | null) ?? null,
  };
}

function mapTemplate(row: Record<string, unknown>): MessageTemplate {
  const variables = Array.isArray(row.variables)
    ? row.variables.filter((item): item is string => typeof item === 'string')
    : [];

  return {
    id: String(row.id),
    owner_id: String(row.owner_id),
    name: String(row.name ?? ''),
    channel: row.channel as MessageTemplateChannel,
    body: String(row.body ?? ''),
    variables,
    created_at: String(row.created_at),
    updated_at: (row.updated_at as string | null) ?? null,
  };
}

export function extractTemplateVariables(body: string): string[] {
  const matches = body.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g);
  return [...new Set([...matches].map((match) => match[1]))].sort();
}

export function renderTemplatePreview(body: string, data: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => data[key] ?? `{{${key}}}`);
}

export async function listProfiles(): Promise<SettingsProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, role, team_id, is_active, created_at, updated_at')
    .order('name', { ascending: true, nullsFirst: false });
  throwIfError(error);
  return (data ?? []) as SettingsProfile[];
}

export async function inviteProfile(input: InviteProfileInput): Promise<SettingsProfile> {
  const email = input.email.trim().toLowerCase();
  const name = input.name?.trim() || email;
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: crypto.randomUUID(),
      email,
      name,
      role: input.role,
      is_active: true,
    })
    .select('id, name, email, role, team_id, is_active, created_at, updated_at')
    .single();
  throwIfError(error);
  return data as SettingsProfile;
}

export async function updateProfileRole(id: string, role: SettingsRole): Promise<void> {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
  throwIfError(error);
}

export async function updateProfileActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('profiles').update({ is_active: isActive }).eq('id', id);
  throwIfError(error);
}

export async function listCustomFields(entity: CustomFieldEntity): Promise<CustomField[]> {
  const { data, error } = await supabase
    .from('custom_fields')
    .select('*')
    .eq('entity', entity)
    .order('order', { ascending: true })
    .order('field_name', { ascending: true });
  throwIfError(error);
  return (data ?? []).map((row) => mapCustomField(row as Record<string, unknown>));
}

export async function createCustomField(input: {
  entity: CustomFieldEntity;
  field_name: string;
  field_type: CustomFieldType;
  options?: string[];
  is_required?: boolean;
  order: number;
  created_by?: string | null;
}): Promise<CustomField> {
  const { data, error } = await supabase
    .from('custom_fields')
    .insert({
      entity: input.entity,
      field_name: input.field_name.trim(),
      field_type: input.field_type,
      options: input.options ?? [],
      is_required: input.is_required ?? false,
      order: input.order,
      created_by: input.created_by ?? null,
    })
    .select('*')
    .single();
  throwIfError(error);
  return mapCustomField(data as Record<string, unknown>);
}

export async function updateCustomField(
  id: string,
  input: Partial<Pick<CustomField, 'field_name' | 'field_type' | 'options' | 'is_required' | 'order'>>,
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (input.field_name !== undefined) payload.field_name = input.field_name.trim();
  if (input.field_type !== undefined) payload.field_type = input.field_type;
  if (input.options !== undefined) payload.options = input.options;
  if (input.is_required !== undefined) payload.is_required = input.is_required;
  if (input.order !== undefined) payload.order = input.order;

  const { error } = await supabase.from('custom_fields').update(payload).eq('id', id);
  throwIfError(error);
}

export async function deleteCustomField(id: string): Promise<void> {
  const { error } = await supabase.from('custom_fields').delete().eq('id', id);
  throwIfError(error);
}

export async function reorderCustomFields(ids: string[]): Promise<void> {
  const results = await Promise.all(
    ids.map((id, index) => supabase.from('custom_fields').update({ order: index }).eq('id', id)),
  );
  const failed = results.find((result) => result.error);
  throwIfError(failed?.error);
}

export async function listMessageTemplates(): Promise<MessageTemplate[]> {
  const { data, error } = await supabase
    .from('message_templates')
    .select('*')
    .order('created_at', { ascending: false });
  throwIfError(error);
  return (data ?? []).map((row) => mapTemplate(row as Record<string, unknown>));
}

export async function createMessageTemplate(input: {
  owner_id: string;
  name: string;
  channel: MessageTemplateChannel;
  body: string;
}): Promise<MessageTemplate> {
  const { data, error } = await supabase
    .from('message_templates')
    .insert({
      owner_id: input.owner_id,
      name: input.name.trim(),
      channel: input.channel,
      body: input.body,
      variables: extractTemplateVariables(input.body),
    })
    .select('*')
    .single();
  throwIfError(error);
  return mapTemplate(data as Record<string, unknown>);
}

export async function updateMessageTemplate(
  id: string,
  input: Pick<MessageTemplate, 'name' | 'channel' | 'body'>,
): Promise<void> {
  const { error } = await supabase
    .from('message_templates')
    .update({
      name: input.name.trim(),
      channel: input.channel,
      body: input.body,
      variables: extractTemplateVariables(input.body),
    })
    .eq('id', id);
  throwIfError(error);
}

export async function deleteMessageTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('message_templates').delete().eq('id', id);
  throwIfError(error);
}
