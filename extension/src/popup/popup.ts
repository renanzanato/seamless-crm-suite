interface Stats {
  today_messages: number
  pending_outbox: number
  active_chats: number
}

interface CurrentChat {
  chat_id: string
  chat_name: string
  is_group: boolean
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!

function setText(sel: string, text: string): void {
  const el = $(sel)
  if (el) el.textContent = text
}

function setBanner(kind: 'ok' | 'warning' | 'error', text: string): void {
  const banner = $('#banner')
  banner.className = kind === 'ok' ? 'banner' : `banner ${kind}`
  setText('#banner-text', text)
}

async function loadStats(): Promise<void> {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'GET_STATS' })
    if (!resp?.ok) {
      setBanner('error', 'Erro ao carregar stats')
      return
    }
    const stats = resp.stats as Stats
    setText('#stat-today',   String(stats.today_messages))
    setText('#stat-chats',   String(stats.active_chats))
    setText('#stat-pending', String(stats.pending_outbox))

    setText('#s-capture',  'ativo')
    setText('#s-supabase', 'conectado')

    const outboxDot = $('#dot-outbox')
    if (stats.pending_outbox > 0) {
      outboxDot.className = 'dot warning'
      setText('#s-outbox', `${stats.pending_outbox} pendentes`)
    } else {
      outboxDot.className = 'dot ok'
      setText('#s-outbox', 'ok')
    }

    $('#status-dot').className = 'status-dot ok'
    setBanner('ok', stats.active_chats > 0
      ? `Monitorando ${stats.active_chats} chats`
      : 'Conectado — abra um chat no WhatsApp Web')
  } catch (e) {
    console.error(e)
    $('#status-dot').className = 'status-dot error'
    setBanner('error', 'Desconectado')
  }
}

async function loadCurrentChat(): Promise<void> {
  const data = await chrome.storage.local.get('current_chat')
  const chat = data.current_chat as CurrentChat | undefined
  const el = $('#current-chat')
  if (!chat) {
    el.innerHTML = '<div class="muted">Abra uma conversa no WhatsApp Web</div>'
    return
  }
  el.innerHTML = `<div class="name">${escape(chat.chat_name)}</div>`
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!))
}

$('#btn-open-crm').addEventListener('click', () => {
  chrome.tabs.create({ url: 'http://localhost:8080' })
})

loadStats()
loadCurrentChat()
setInterval(loadStats, 3000)
