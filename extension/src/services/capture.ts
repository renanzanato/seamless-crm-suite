// ─────────────────────────────────────────────────────────────────
// Pipa Driven — Serviço de captura de mensagens
// Lógica de extração DOM para o WhatsApp Web
// ─────────────────────────────────────────────────────────────────

import type { WhatsAppMessage } from '../types/message'

// ── Parsing do atributo data-pre-plain-text ────────────────────
// CRÍTICO: usar este atributo evita o bug "Kkkkkk16:02"
// onde o timestamp aparece colado no texto da mensagem.
// O atributo tem formato: "[HH:MM, DD/MM/YYYY] Nome Sobrenome: "

export interface PrePlainTextData {
  time: string
  date: string
  sender: string
  raw: string
}

export function parsePrePlainText(attr: string): PrePlainTextData {
  const raw = String(attr || '')
  const match = raw.match(/\[(\d{2}:\d{2}), (\d{2}\/\d{2}\/\d{4})\] (.+?): /)
  if (!match) return { time: '', date: '', sender: '', raw }
  return { time: match[1], date: match[2], sender: match[3], raw }
}

// ── Converte data/hora do formato BR para ISO 8601 ─────────────

export function toISO(date: string, time: string): string {
  // date: "DD/MM/YYYY", time: "HH:MM"
  if (!date || !time) return new Date().toISOString()
  const [day, month, year] = date.split('/')
  const [hour, minute] = time.split(':')
  const d = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0
  )
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

// ── Seletores do WhatsApp Web (2024/2025) ──────────────────────

export const WA_SELECTORS = {
  conversationHeader: [
    "header span[data-testid='conversation-info-header-chat-title']",
    '#main header [data-testid=\'conversation-info-header-chat-title\']',
    "header [role='button'] span[dir='auto']",
    '#main header span[title]',
    '#main header ._amig span',
  ],
  messageContainer: [
    "[data-testid='conversation-panel-messages']",
    "#main [role='application']",
    "#main .copyable-area > div[tabindex='-1']",
    '#main .copyable-area',
  ],
  messageRow: [
    "[data-testid='msg-container']",
    '[data-pre-plain-text]',
    '.message-in',
    '.message-out',
  ],
  removableMeta: [
    "[data-testid='msg-meta']",
    "[data-testid='msg-status']",
    "[data-icon='msg-dblcheck']",
    "[data-icon='msg-check']",
    "[data-icon='msg-time']",
    'button',
    "[role='button']",
    'audio',
    'video',
    "svg[aria-label]",
  ],
  audioIndicators: [
    'audio',
    "[data-icon*='ptt']",
    "[data-icon*='audio']",
    "[data-testid*='ptt']",
    "[data-testid*='audio']",
    "[aria-label*='voice' i]",
    "[aria-label*='udio' i]",
  ],
}

export function queryFirst(selectors: string[], root: Document | Element = document): Element | null {
  for (const selector of selectors) {
    try {
      const node = root.querySelector(selector)
      if (node) return node
    } catch {
      // seletor inválido — ignora
    }
  }
  return null
}

// ── Extração de nome do chat atual ────────────────────────────

export function getCurrentChatName(): string {
  const header = queryFirst(WA_SELECTORS.conversationHeader)
  if (!header) return ''
  return (header as HTMLElement).getAttribute('title') || (header as HTMLElement).textContent?.trim() || ''
}

// ── Detecção de direção da mensagem ───────────────────────────

export function detectDirection(row: Element): 'inbound' | 'outbound' {
  if (
    row.classList.contains('message-out') ||
    row.querySelector("[data-testid='msg-status']") ||
    row.querySelector("[data-icon='msg-dblcheck']") ||
    row.querySelector("[data-icon='msg-check']")
  ) {
    return 'outbound'
  }
  return 'inbound'
}

// ── Detecção de tipo de mensagem ──────────────────────────────

export function detectMessageType(
  row: Element
): WhatsAppMessage['message_type'] {
  const hasAudio = WA_SELECTORS.audioIndicators.some((sel) => {
    try { return Boolean(row.querySelector(sel)) } catch { return false }
  })
  if (hasAudio) return 'audio'

  if (row.querySelector('img:not([data-icon])')) return 'image'
  if (row.querySelector('video')) return 'video'
  if (row.querySelector("[data-testid*='document']")) return 'document'

  return 'text'
}

// ── Limpeza de clone para extração de texto ────────────────────

function cleanseTextClone(node: Element): string {
  const clone = node.cloneNode(true) as Element
  WA_SELECTORS.removableMeta.forEach((selector) => {
    try {
      clone.querySelectorAll(selector).forEach((el) => el.remove())
    } catch {
      // ignora
    }
  })
  return ((clone as HTMLElement).innerText || clone.textContent || '').trim()
}

// ── Extração de texto da mensagem ────────────────────────────

export function extractMessageText(row: Element): string {
  // Prioridade: span.selectable-text > .copyable-text > balloon-text > dir=auto
  const candidates = [
    row.querySelector('span.selectable-text'),
    row.querySelector("[data-testid='balloon-text']"),
    row.querySelector('.copyable-text'),
    row.querySelector("[dir='auto']"),
  ].filter(Boolean) as Element[]

  let best = ''
  for (const c of candidates) {
    const text = cleanseTextClone(c)
    if (text.length > best.length) best = text
  }

  return best || cleanseTextClone(row)
}

// ── Normalização de texto ─────────────────────────────────────

export function normalizeText(value: string): string {
  return String(value || '')
    .replace(/\u200e/g, '')
    .replace(/\u200f/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── Gera ID de fingerprint para deduplicação ──────────────────

export function hashFingerprint(value: string): string {
  let hash = 2166136261
  const input = String(value || '')
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

// ── Extração de uma mensagem individual do DOM ─────────────────
// Retorna null se a mensagem não tiver conteúdo válido

export function extractMessageFromRow(
  row: Element,
  chatName: string,
  chatPhone: string | null
): WhatsAppMessage | null {
  // 1. Obtém o atributo data-pre-plain-text (pode estar no próprio row ou em um pai)
  const prefixNode = row.matches('[data-pre-plain-text]')
    ? row
    : row.querySelector('[data-pre-plain-text]')

  const attr = prefixNode?.getAttribute('data-pre-plain-text') || ''
  const parsed = parsePrePlainText(attr)

  // 2. Direção e tipo
  const direction = detectDirection(row)
  const messageType = detectMessageType(row)

  // 3. Texto — para áudio usa placeholder
  let content: string
  if (messageType === 'audio') {
    const durationEl = row.querySelector('span, div')
    const durationSpans = row.querySelectorAll('span, div')
    let duration = ''
    durationSpans.forEach((el) => {
      const t = (el as HTMLElement).textContent?.trim() || ''
      if (/^\d{1,2}:\d{2}$/.test(t) && !duration) duration = t
    })
    content = duration ? `[Audio] (${duration})` : '[Audio]'
  } else {
    content = normalizeText(extractMessageText(row))
  }

  if (!content) return null

  // 4. Timestamp — SEMPRE usa data-pre-plain-text, nunca texto visível
  const timestamp = toISO(parsed.date, parsed.time)

  // 5. Nome do sender
  const senderName = parsed.sender || (direction === 'outbound' ? 'Eu' : chatName)

  // 6. Fingerprint para deduplicação
  const fingerprintSource = `${chatName}|${senderName}|${direction}|${messageType}|${parsed.time}|${parsed.date}|${content}`
  const messageId = hashFingerprint(fingerprintSource)

  return {
    id: messageId,
    chat_id: chatName.toLowerCase().replace(/\s+/g, '_'),
    chat_name: chatName,
    sender_name: senderName,
    sender_phone: direction === 'inbound' ? chatPhone : null,
    content,
    message_type: messageType,
    media_url: null,
    media_type: null,
    media: null,
    timestamp,
    direction,
    crm_contact_id: null,
    crm_deal_id: null,
    raw_timestamp: attr || null,
    processed: false,
  }
}

// ── Extrai todas as mensagens visíveis no DOM atual ───────────

export function extractAllVisibleMessages(
  chatName: string,
  chatPhone: string | null
): WhatsAppMessage[] {
  const container = queryFirst(WA_SELECTORS.messageContainer)
  if (!container) return []

  const rows = new Set<Element>()
  WA_SELECTORS.messageRow.forEach((selector) => {
    try {
      container.querySelectorAll(selector).forEach((node) => {
        const row =
          node.closest("[data-testid='msg-container'], .message-in, .message-out") || node
        if (row && container.contains(row)) rows.add(row)
      })
    } catch {
      // seletor inválido
    }
  })

  const sorted = Array.from(rows).sort((a, b) => {
    const pos = a.compareDocumentPosition(b)
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
  })

  const messages: WhatsAppMessage[] = []
  const seen = new Set<string>()

  for (const row of sorted) {
    const msg = extractMessageFromRow(row, chatName, chatPhone)
    if (msg && !seen.has(msg.id!)) {
      seen.add(msg.id!)
      messages.push(msg)
    }
  }

  return messages
}
