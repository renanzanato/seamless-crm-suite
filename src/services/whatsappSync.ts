import { createClient } from '@supabase/supabase-js'
import type { WhatsAppMessage, OutboxMessage, ChatRow } from '@/types/whatsapp'

const SUPABASE_URL = 'https://dsvkoeomtnwccxxcwwga.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzdmtvZW9tdG53Y2N4eGN3d2dhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzOTkyOTIsImV4cCI6MjA5MDk3NTI5Mn0.lKYhSA9LO8Zpx8DANxj9lfa1CYeQBBCx7LBQC3sq1y8'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export async function getMessagesByChat(chat_id: string): Promise<WhatsAppMessage[]> {
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('*')
    .eq('chat_id', chat_id)
    .order('timestamp_wa', { ascending: true })
    .limit(500)
  if (error) throw error
  return (data ?? []) as WhatsAppMessage[]
}

export async function getMessagesByDeal(deal_id: string): Promise<WhatsAppMessage[]> {
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('*')
    .eq('crm_deal_id', deal_id)
    .order('timestamp_wa', { ascending: true })
    .limit(500)
  if (error) throw error
  return (data ?? []) as WhatsAppMessage[]
}

export async function listChats(): Promise<ChatRow[]> {
  const { data, error } = await supabase
    .from('chats')
    .select('*')
    .order('last_seen_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data ?? []) as ChatRow[]
}

export async function sendMessage(chat_id: string, content_md: string): Promise<string> {
  const { data, error } = await supabase
    .from('whatsapp_outbox')
    .insert({ chat_id, content_md, status: 'pending' })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export function subscribeMessages(chat_id: string, onMessage: (m: WhatsAppMessage) => void) {
  return supabase
    .channel(`mirror:${chat_id}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'whatsapp_messages',
      filter: `chat_id=eq.${chat_id}`,
    }, (payload) => {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        onMessage(payload.new as WhatsAppMessage)
      }
    })
    .subscribe()
}

export function subscribeOutbox(chat_id: string, onChange: (m: OutboxMessage) => void) {
  return supabase
    .channel(`outbox:${chat_id}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'whatsapp_outbox',
      filter: `chat_id=eq.${chat_id}`,
    }, (payload) => {
      if (payload.new) onChange(payload.new as OutboxMessage)
    })
    .subscribe()
}

export async function linkChatToDeal(chat_id: string, deal_id: string): Promise<void> {
  await supabase.from('chats').update({ crm_deal_id: deal_id }).eq('chat_id', chat_id)
  await supabase.from('whatsapp_messages').update({ crm_deal_id: deal_id }).eq('chat_id', chat_id)
}
