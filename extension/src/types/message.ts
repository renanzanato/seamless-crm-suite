export type MessageType =
  | 'text' | 'audio' | 'image' | 'video' | 'document' | 'sticker' | 'system'

export interface CapturedMessage {
  raw_id: string
  chat_id: string
  chat_name: string
  author: string | null
  author_phone: string | null
  direction: 'in' | 'out'
  type: MessageType
  content_md: string
  media_url_blob: string | null
  media_mime: string | null
  reply_to_raw_id: string | null
  timestamp_wa: string  // ISO 8601 UTC
}

export interface CapturedChat {
  chat_id: string
  chat_name: string
  is_group: boolean
  phone: string | null
}

export interface BridgeMessage {
  type: 'NEW_MESSAGE' | 'NEW_CHAT' | 'SEND_REQUEST'
  payload: unknown
}
