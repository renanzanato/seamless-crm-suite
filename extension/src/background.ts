import {
  upsertMessage, upsertChat,
  claimOutbox, markOutboxSent, markOutboxFailed,
  getStats,
} from './services/supabase'
import { markdownToWhatsapp } from './services/markdown'
import type { CapturedMessage, CapturedChat } from './types/message'

// ============================================================
// Ingestão de mensagens do content script
// ============================================================

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handle = async () => {
    try {
      if (msg?.type === 'NEW_MESSAGE') {
        await upsertMessage(msg.payload as CapturedMessage)
        sendResponse({ ok: true })
        return
      }
      if (msg?.type === 'NEW_CHAT') {
        const chat = msg.payload as CapturedChat
        await upsertChat(chat)
        await chrome.storage.local.set({ current_chat: chat })
        sendResponse({ ok: true })
        return
      }
      if (msg?.type === 'GET_STATS') {
        const stats = await getStats()
        sendResponse({ ok: true, stats })
        return
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e) })
    }
  }
  handle()
  return true // async
})

// ============================================================
// Polling da outbox — envia mensagens do CRM pro WhatsApp
// ============================================================

const POLL_INTERVAL_MIN = 1 // Chrome MV3 mínimo = 1 min


async function pollOutbox(): Promise<void> {
  try {
    const row = await claimOutbox()
    if (!row) return

    const tab = await findWhatsAppTab()
    if (!tab?.id) {
      await markOutboxFailed(row.id, 'WhatsApp Web não está aberto')
      return
    }

    const content_wa = markdownToWhatsapp(row.content_md)

    const resp = await chrome.tabs.sendMessage(tab.id, {
      type: 'SEND_REQUEST',
      payload: { chat_id: row.chat_id, content_wa },
    }).catch((e) => ({ ok: false, error: String(e) }))

    if (resp?.ok) {
      await markOutboxSent(row.id, resp.raw_id ?? 'pending-capture')
    } else {
      await markOutboxFailed(row.id, resp?.error ?? 'unknown')
    }
  } catch (e) {
    console.error('[Pipa] pollOutbox error', e)
  }
}

async function findWhatsAppTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' })
  return tabs[0] ?? null
}

// Chrome MV3: usa alarms ao invés de setInterval (persiste)
chrome.alarms.create('pipa-poll', { periodInMinutes: POLL_INTERVAL_MIN })
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'pipa-poll') pollOutbox()
})

// Primeiro poll imediato ao instalar/ativar
chrome.runtime.onInstalled.addListener(() => {
  pollOutbox()
})

chrome.runtime.onStartup.addListener(() => {
  pollOutbox()
})
