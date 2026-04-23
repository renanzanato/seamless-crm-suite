// WhatsApp formatting → Markdown
// *bold*   → **bold**
// _italic_ → *italic*
// ~strike~ → ~~strike~~
// `code`   → `code`
// URL é preservada como está
// Emoji é preservado como char unicode

const PATTERNS: Array<[RegExp, string]> = [
  // Ordem importa: code primeiro (preserva conteúdo de dentro)
  [/`([^`\n]+)`/g, '`$1`'],
  // Negrito: *texto*  (mas não ** e não * isolado)
  [/(?<![*\w])\*([^\s*][^*\n]*?[^\s*]|\S)\*(?!\w)/g, '**$1**'],
  // Itálico: _texto_
  [/(?<![_\w])_([^\s_][^_\n]*?[^\s_]|\S)_(?!\w)/g, '*$1*'],
  // Risco: ~texto~
  [/(?<![~\w])~([^\s~][^~\n]*?[^\s~]|\S)~(?!\w)/g, '~~$1~~'],
]

export function whatsappToMarkdown(raw: string): string {
  if (!raw) return ''
  let out = raw
  for (const [re, sub] of PATTERNS) {
    out = out.replace(re, sub)
  }
  return out
}

// Markdown → WhatsApp (usado na outbox, ao enviar)
export function markdownToWhatsapp(md: string): string {
  if (!md) return ''
  let out = md
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '*$1*')        // bold
  out = out.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '_$1_') // italic
  out = out.replace(/~~([^~\n]+)~~/g, '~$1~')            // strike
  return out
}
