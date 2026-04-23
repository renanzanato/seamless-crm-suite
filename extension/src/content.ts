import { extractMessage, extractCurrentChat } from './services/dom-extract'
import type { CapturedMessage } from './types/message'

const SEEN = new Set<string>()

function sendToBackground(msg: CapturedMessage): void {
  chrome.runtime.sendMessage({ type: 'NEW_MESSAGE', payload: msg }).catch(() => {
    // background pode estar suspenso; mensagem vai ser re-enfileirada pelo storage
  })
}

function processNode(node: Element): void {
  const msgNodes = node.matches?.('[data-id]')
    ? [node]
    : Array.from(node.querySelectorAll?.('[data-id]') ?? [])

  for (const n of msgNodes) {
    const id = n.getAttribute('data-id')
    if (!id || SEEN.has(id)) continue
    const msg = extractMessage(n)
    if (!msg) continue
    SEEN.add(id)
    sendToBackground(msg)
  }
}

function startObserver(): void {
  const root = document.querySelector('#main')
  if (!root) {
    setTimeout(startObserver, 1000)
    return
  }

  // Captura mensagens que já estão na tela
  processNode(root)

  const observer = new MutationObserver((mutations) => {
    for (const mut of mutations) {
      mut.addedNodes.forEach((n) => {
        if (n.nodeType === Node.ELEMENT_NODE) processNode(n as Element)
      })
    }
  })

  observer.observe(root, { childList: true, subtree: true })
  console.log('[Pipa] Observer iniciado')
}

// Notifica chat atual para o background
function watchChatChange(): void {
  let lastChatId: string | null = null
  setInterval(() => {
    const chat = extractCurrentChat()
    if (!chat || chat.chat_id === lastChatId) return
    lastChatId = chat.chat_id
    chrome.runtime.sendMessage({
      type: 'NEW_CHAT',
      payload: chat,
    }).catch(() => { /* noop */ })
    // Reset SEEN ao trocar de chat evita miss de mensagens antigas de outro chat
  }, 1500)
}

// Listener para pedidos do background (enviar mensagem via outbox)
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'SEND_REQUEST') {
    sendMessageToChat(msg.payload)
      .then((raw_id) => sendResponse({ ok: true, raw_id }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }))
    return true // async
  }
})

async function openChatInPane(chat_id: string): Promise<boolean> {
  // já está aberto?
  const cur = extractCurrentChat()
  if (cur?.chat_id === chat_id) return true

  // tenta achar o chat no pane-side por data-id
  const normalized = chat_id.replace(/^name:/, '')
  const selectors = [
    `#pane-side [data-id$="${normalized}"]`,
    `#pane-side [data-id*="${normalized}"]`,
  ]
  for (const sel of selectors) {
    const item = document.querySelector(sel) as HTMLElement | null
    if (item) {
      const clickable = (item.closest('[role="listitem"]') || item) as HTMLElement
      clickable.click()
      // espera #main renderizar
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 150))
        const c = extractCurrentChat()
        if (c?.chat_id === chat_id) return true
      }
    }
  }
  return false
}

async function sendMessageToChat({ chat_id, content_wa }: { chat_id: string; content_wa: string }): Promise<string> {
  const ok = await openChatInPane(chat_id)
  if (!ok) throw new Error(`Chat ${chat_id} não encontrado no pane-side`)

  // input: footer do #main, evita pegar a barra de busca
  const box = document.querySelector('#main footer div[contenteditable="true"]') as HTMLElement | null
  if (!box) throw new Error('Input do WhatsApp não encontrado')
  box.focus()
  document.execCommand('insertText', false, content_wa)
  await new Promise((r) => setTimeout(r, 250))
  const btn = document.querySelector('#main footer button[aria-label*="Enviar" i], #main footer [data-icon="send"]') as HTMLElement | null
  if (!btn) throw new Error('Botão enviar não encontrado')
  ;(btn.closest('button') || btn).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 800))
  return 'pending-capture'
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    startObserver()
    watchChatChange()
  })
} else {
  startObserver()
  watchChatChange()
}
