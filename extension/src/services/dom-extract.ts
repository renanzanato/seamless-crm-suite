import { whatsappToMarkdown } from './markdown'
import type { CapturedMessage, MessageType } from '../types/message'

/**
 * Parse do atributo data-pre-plain-text do WhatsApp.
 * Formato: "[HH:MM, DD/MM/YYYY] Nome: "
 * Retorna data em UTC ISO.
 */
export function parsePrePlainText(attr: string | null): {
  timestamp_wa: string | null
  author: string | null
} {
  if (!attr) return { timestamp_wa: null, author: null }
  const m = attr.match(/^\[(\d{2}):(\d{2}), (\d{2})\/(\d{2})\/(\d{4})\]\s+(.+?):\s*$/)
  if (!m) return { timestamp_wa: null, author: null }
  const [, hh, mm, dd, MM, yyyy, author] = m
  // Constrói Date no fuso local do browser, depois converte pra ISO UTC
  const local = new Date(
    Number(yyyy), Number(MM) - 1, Number(dd),
    Number(hh), Number(mm), 0, 0
  )
  return {
    timestamp_wa: local.toISOString(),
    author: author.trim(),
  }
}

function detectType(node: Element): MessageType {
  if (node.querySelector('audio'))                                return 'audio'
  if (node.querySelector('img[src^="blob:"]'))                    return 'image'
  if (node.querySelector('video'))                                return 'video'
  if (node.querySelector('[data-icon="document"], [data-icon="document-refreshed"]')) return 'document'
  if (node.querySelector('[data-icon="sticker"]'))                return 'sticker'
  return 'text'
}

function extractText(node: Element): string {
  const span = node.querySelector('span.selectable-text.copyable-text, span.selectable-text')
  if (!span) return ''
  // Preserva emojis substituindo imagens de emoji pelo alt
  const clone = span.cloneNode(true) as Element
  clone.querySelectorAll('img[alt]').forEach((img) => {
    img.replaceWith(document.createTextNode((img as HTMLImageElement).alt))
  })
  return clone.textContent ?? ''
}

function extractMedia(node: Element): { url: string | null; mime: string | null } {
  const audio = node.querySelector('audio') as HTMLAudioElement | null
  if (audio?.src) return { url: audio.src, mime: 'audio/ogg' }
  const img = node.querySelector('img[src^="blob:"]') as HTMLImageElement | null
  if (img?.src)   return { url: img.src, mime: 'image/jpeg' }
  const video = node.querySelector('video') as HTMLVideoElement | null
  if (video?.src) return { url: video.src, mime: 'video/mp4' }
  return { url: null, mime: null }
}

export function extractCurrentChat(): { chat_id: string; chat_name: string; is_group: boolean } | null {
  const header = document.querySelector('#main header')
  if (!header) return null
  const nameEl = header.querySelector('span[dir="auto"][title]') as HTMLElement | null
  const chat_name = nameEl?.getAttribute('title') ?? nameEl?.textContent ?? ''
  if (!chat_name) return null

  // chat_id estável: pega o WID do item ativo no pane-side.
  // WhatsApp marca o chat aberto com aria-selected="true" ou classe _ak8l no container.
  let chat_id = ''
  const active =
    document.querySelector('#pane-side [aria-selected="true"][data-id]') ||
    document.querySelector('#pane-side div[role="listitem"][aria-selected="true"] [data-id]') ||
    document.querySelector('#pane-side [tabindex="-1"][data-id]')
  const rawId = active?.getAttribute('data-id') ?? ''
  // data-id no pane-side geralmente vem como "55119...@c.us" ou "false_55119...@c.us"
  if (rawId) {
    const m = rawId.match(/([\d\-]+@[cg]\.us)/i)
    chat_id = m ? m[1] : rawId
  }
  // fallback: extrai de qualquer mensagem no #main
  if (!chat_id) {
    const anyMsg = document.querySelector('#main [data-id]')
    const mid = anyMsg?.getAttribute('data-id') ?? ''
    const mm = mid.match(/_([\d\-]+@[cg]\.us)_/i) || mid.match(/([\d\-]+@[cg]\.us)/i)
    if (mm) chat_id = mm[1]
  }
  // último recurso: name (evita cair, mas gera warning)
  if (!chat_id) {
    console.warn('[Pipa] chat_id não resolvido, usando nome como fallback')
    chat_id = `name:${chat_name}`
  }

  const is_group = !!header.querySelector('[data-icon="default-group"]') || chat_id.endsWith('@g.us')
  return { chat_id, chat_name, is_group }
}

export function extractMessage(node: Element): CapturedMessage | null {
  const raw_id = node.getAttribute('data-id')
  if (!raw_id) return null

  // Ignorar mensagens de sistema (grupo) e banners
  if (node.querySelector('[data-testid="system-message"]')) {
    return buildSystemMessage(node, raw_id)
  }

  const container = node.querySelector('[data-pre-plain-text]') as HTMLElement | null
  const pre = container?.getAttribute('data-pre-plain-text') ?? null
  const { timestamp_wa, author } = parsePrePlainText(pre)

  const chat = extractCurrentChat()
  if (!chat) return null

  const direction: 'in' | 'out' = node.classList.contains('message-out') ? 'out' : 'in'
  const type = detectType(node)

  const rawText = extractText(node)
  const { url: media_url_blob, mime: media_mime } = extractMedia(node)

  let content_md = whatsappToMarkdown(rawText)
  if (type === 'audio' && !content_md) {
    const duration = node.querySelector('[data-testid="audio-play"]')?.parentElement?.textContent ?? ''
    content_md = `[áudio ${duration.trim()}]`.trim()
  } else if (type === 'image' && !content_md) {
    content_md = '[imagem]'
  } else if (type === 'video' && !content_md) {
    content_md = '[vídeo]'
  } else if (type === 'document' && !content_md) {
    content_md = '[documento]'
  } else if (type === 'sticker') {
    content_md = '[sticker]'
  }

  return {
    raw_id,
    chat_id: chat.chat_id,
    chat_name: chat.chat_name,
    author: direction === 'out' ? null : author,
    author_phone: null,
    direction,
    type,
    content_md,
    media_url_blob,
    media_mime,
    reply_to_raw_id: node.querySelector('[data-id-quoted]')?.getAttribute('data-id-quoted') ?? null,
    timestamp_wa: timestamp_wa ?? new Date().toISOString(),
  }
}

function buildSystemMessage(node: Element, raw_id: string): CapturedMessage {
  const text = node.textContent ?? ''
  const chat = extractCurrentChat() ?? { chat_id: 'unknown', chat_name: 'unknown', is_group: false }
  return {
    raw_id,
    chat_id: chat.chat_id,
    chat_name: chat.chat_name,
    author: null,
    author_phone: null,
    direction: 'in',
    type: 'system',
    content_md: `_${text.trim()}_`,
    media_url_blob: null,
    media_mime: null,
    reply_to_raw_id: null,
    timestamp_wa: new Date().toISOString(),
  }
}
