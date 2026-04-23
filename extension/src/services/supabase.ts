import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config'
import type { CapturedMessage, CapturedChat } from '../types/message'

let _client: SupabaseClient | null = null
export function sb(): SupabaseClient {
  if (!_client) _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 2 } },
  })
  return _client
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < tries; i++) {
    try { return await fn() }
    catch (e) {
      lastErr = e
      await new Promise((r) => setTimeout(r, 300 * Math.pow(2, i)))
    }
  }
  throw lastErr
}

export async function upsertMessage(m: CapturedMessage): Promise<void> {
  // media_url_blob é blob local — upload real deve acontecer em background
  // Por ora salva sem media_url (pendente); upload fica como TODO próxima fase
  await withRetry(async () => {
    const { error } = await sb()
      .from('whatsapp_messages')
      .upsert({
        raw_id:          m.raw_id,
        chat_id:         m.chat_id,
        chat_name:       m.chat_name,
        author:          m.author,
        author_phone:    m.author_phone,
        direction:       m.direction,
        type:            m.type,
        content_md:      m.content_md,
        media_url:       null,          // upload futuro
        media_mime:      m.media_mime,
        reply_to_raw_id: m.reply_to_raw_id,
        timestamp_wa:    m.timestamp_wa,
      }, { onConflict: 'raw_id' })
    if (error) throw error
  })
}

export async function upsertChat(c: CapturedChat): Promise<void> {
  await withRetry(async () => {
    const { error } = await sb()
      .from('chats')
      .upsert({
        chat_id:      c.chat_id,
        chat_name:    c.chat_name,
        is_group:     c.is_group,
        phone:        c.phone,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: 'chat_id' })
    if (error) throw error
  })
}

export interface OutboxRow {
  id: string
  chat_id: string
  content_md: string
  status: 'pending' | 'sending' | 'sent' | 'failed'
}

export async function claimOutbox(): Promise<OutboxRow | null> {
  // Atômico: pega o mais antigo pending e marca sending
  const { data, error } = await sb()
    .from('whatsapp_outbox')
    .select('id, chat_id, content_md, status')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null

  const { error: updErr } = await sb()
    .from('whatsapp_outbox')
    .update({ status: 'sending' })
    .eq('id', data.id)
    .eq('status', 'pending')

  if (updErr) return null
  return data as OutboxRow
}

export async function markOutboxSent(id: string, raw_id: string): Promise<void> {
  await sb().from('whatsapp_outbox').update({
    status: 'sent',
    sent_at: new Date().toISOString(),
    raw_id,
  }).eq('id', id)
}

export async function markOutboxFailed(id: string, error: string): Promise<void> {
  await sb().from('whatsapp_outbox').update({
    status: 'failed',
    error,
  }).eq('id', id)
}

export async function getStats(): Promise<{
  today_messages: number
  pending_outbox: number
  active_chats: number
}> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [msgs, outbox, chats] = await Promise.all([
    sb().from('whatsapp_messages').select('id', { count: 'exact', head: true })
       .gte('captured_at', today.toISOString()),
    sb().from('whatsapp_outbox').select('id', { count: 'exact', head: true })
       .in('status', ['pending', 'sending']),
    sb().from('chats').select('id', { count: 'exact', head: true })
       .gte('last_seen_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
  ])

  return {
    today_messages: msgs.count ?? 0,
    pending_outbox: outbox.count ?? 0,
    active_chats:   chats.count ?? 0,
  }
}
