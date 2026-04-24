import { supabase } from '@/lib/supabase'
import type { WhatsAppMessage, OutboxMessage, ChatRow, MessageType, MessageDirection } from '@/types/whatsapp'

type DbRecord = Record<string, unknown>

const CANONICAL_MESSAGE_SELECT = `
  id, chat_key, chat_id, wa_message_id, provider_message_id, direction,
  message_type, body, occurred_at, sent_at, created_at, media_url, metadata
`

const LEGACY_MESSAGE_SELECT = `
  id, chat_id, crm_deal_id, raw_id, wa_message_id, direction, type,
  message_type, author, phone, content_md, body, media_url, media_mime,
  quoted_raw_id, timestamp_wa, sent_at, created_at, captured_at
`

const CANONICAL_CHAT_SELECT = `
  id, chat_key, wa_chat_id, title, phone_number, source,
  message_count, last_message_at, updated_at, created_at
`

function isRecord(value: unknown): value is DbRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown) {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = stringValue(value)
    if (text) return text
  }
  return null
}

function normalizeDirection(value: unknown): MessageDirection {
  const normalized = firstString(value)?.toLowerCase()
  return normalized === 'outbound' || normalized === 'sent' || normalized === 'out' ? 'out' : 'in'
}

function normalizeMessageType(value: unknown): MessageType {
  const normalized = firstString(value)?.toLowerCase()
  if (
    normalized === 'audio'
    || normalized === 'image'
    || normalized === 'video'
    || normalized === 'document'
    || normalized === 'sticker'
    || normalized === 'system'
  ) {
    return normalized
  }
  return 'text'
}

function mapMessage(row: DbRecord): WhatsAppMessage {
  const metadata = isRecord(row.metadata) ? row.metadata : {}
  const chatId = firstString(row.chat_key, row.chat_id, metadata.wa_chat_id) ?? ''
  const timestamp = firstString(row.timestamp_wa, row.occurred_at, row.sent_at, row.created_at) ?? new Date().toISOString()

  return {
    id: firstString(row.id) ?? crypto.randomUUID(),
    chat_id: chatId,
    deal_id: firstString(row.crm_deal_id) ?? null,
    raw_id: firstString(row.raw_id, row.provider_message_id, row.wa_message_id, row.id) ?? '',
    direction: normalizeDirection(row.direction),
    type: normalizeMessageType(row.type ?? row.message_type),
    author: firstString(row.author, metadata.author),
    phone: firstString(row.phone),
    content_md: firstString(row.content_md, row.body) ?? '',
    media_url: firstString(row.media_url, metadata.media_url),
    media_mime: firstString(row.media_mime, metadata.media_mime),
    quoted_raw_id: firstString(row.quoted_raw_id, metadata.quoted_msg_id),
    timestamp_wa: timestamp,
    captured_at: firstString(row.captured_at, row.created_at, row.occurred_at) ?? timestamp,
  }
}

function mapChat(row: DbRecord): ChatRow {
  const chatId = firstString(row.chat_key, row.chat_id, row.wa_chat_id, row.id) ?? ''
  const waChatId = firstString(row.wa_chat_id, row.chat_id)

  return {
    id: firstString(row.id) ?? chatId,
    chat_id: chatId,
    chat_name: firstString(row.chat_name, row.title, row.phone_number, waChatId, chatId) ?? 'WhatsApp',
    phone: firstString(row.phone, row.phone_number),
    is_group: Boolean(waChatId && /@g\.us$/i.test(waChatId)),
    deal_id: firstString(row.deal_id, row.crm_deal_id),
    last_seen_at: firstString(row.last_seen_at, row.last_message_at, row.updated_at, row.created_at) ?? new Date().toISOString(),
    created_at: firstString(row.created_at) ?? new Date().toISOString(),
  }
}

async function getMessagesByColumn(column: 'chat_key' | 'chat_id', value: string, select: string, orderBy: string) {
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select(select)
    .eq(column, value)
    .order(orderBy, { ascending: true })
    .limit(500)

  if (error) throw error
  return ((data ?? []) as DbRecord[]).map(mapMessage)
}

export async function getMessagesByChat(chatId: string): Promise<WhatsAppMessage[]> {
  try {
    const messages = await getMessagesByColumn('chat_key', chatId, CANONICAL_MESSAGE_SELECT, 'occurred_at')
    if (messages.length > 0) return messages
  } catch {
    // Continue to the legacy mirror fallback below.
  }

  try {
    return await getMessagesByColumn('chat_id', chatId, LEGACY_MESSAGE_SELECT, 'timestamp_wa')
  } catch {
    return getMessagesByColumn('chat_id', chatId, LEGACY_MESSAGE_SELECT, 'created_at')
  }
}

export async function getMessagesByDeal(dealId: string): Promise<WhatsAppMessage[]> {
  try {
    const { data, error } = await supabase
      .from('whatsapp_messages')
      .select(LEGACY_MESSAGE_SELECT)
      .eq('crm_deal_id', dealId)
      .order('timestamp_wa', { ascending: true })
      .limit(500)

    if (error) throw error
    return ((data ?? []) as DbRecord[]).map(mapMessage)
  } catch {
    return []
  }
}

export async function listChats(): Promise<ChatRow[]> {
  try {
    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .select(CANONICAL_CHAT_SELECT)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(100)

    if (error) throw error
    const rows = ((data ?? []) as DbRecord[]).map(mapChat)
    if (rows.length > 0) return rows
  } catch {
    // Continue to the legacy mirror fallback below.
  }

  const { data, error } = await supabase
    .from('chats')
    .select('*')
    .order('last_seen_at', { ascending: false })
    .limit(100)

  if (error) throw error
  return ((data ?? []) as DbRecord[]).map(mapChat)
}

export async function sendMessage(chatId: string, contentMd: string): Promise<string> {
  const { data, error } = await supabase
    .from('whatsapp_outbox')
    .insert({ chat_id: chatId, content_md: contentMd, status: 'pending' })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export function subscribeMessages(chatId: string, onMessage: (m: WhatsAppMessage) => void) {
  return supabase
    .channel(`mirror:${chatId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'whatsapp_messages',
      filter: `chat_key=eq.${chatId}`,
    }, (payload) => {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        onMessage(mapMessage(payload.new as DbRecord))
      }
    })
    .subscribe()
}

export function subscribeOutbox(chatId: string, onChange: (m: OutboxMessage) => void) {
  return supabase
    .channel(`outbox:${chatId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'whatsapp_outbox',
      filter: `chat_id=eq.${chatId}`,
    }, (payload) => {
      if (payload.new) onChange(payload.new as OutboxMessage)
    })
    .subscribe()
}

export async function linkChatToDeal(chatId: string, dealId: string): Promise<void> {
  await supabase.from('whatsapp_messages').update({ crm_deal_id: dealId }).eq('chat_key', chatId)
  await supabase.from('chats').update({ crm_deal_id: dealId }).eq('chat_id', chatId)
}
