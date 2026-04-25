# Phase 1A.2 — Captura de media real do WhatsApp

Resumo das mudanças e como validar.

---

## O que foi feito

### 1. Extensão baixa media real pelo WPP

- [extension/inject-wa.js](../extension/inject-wa.js) agora tenta `WPP.chat.downloadMedia(msg)` para mensagens `audio`, `image`, `video`, `document`, `sticker` e media genérica.
- A media é serializada como `data_url` apenas até 25 MB para evitar travar o WhatsApp Web/Chrome messaging.
- O tipo deixa de virar sempre `media`: imagens, vídeos, documentos e stickers preservam o tipo real quando o WPP fornece.

### 2. Upload deduplicado para Supabase Storage

- [extension/background.js](../extension/background.js) sobe a media para o bucket `whatsapp-media` antes da RPC.
- Path determinístico: `{owner_id}/{chat_key}/{wa_message_id}.{ext}`.
- Upload acontece só depois de resolver contato aprovado, evitando poluir Storage com chats ignorados.
- Se o objeto já existir, a extensão reaproveita a URL pública e segue o ingest.

### 3. RPC persiste metadata de media

- Nova migration [20260424_capture_whatsapp_media.sql](../supabase/migrations/20260424_capture_whatsapp_media.sql).
- Cria bucket `whatsapp-media` e policies para authenticated.
- Substitui `public.ingest_whatsapp_chat` para aceitar:
  - `media_url`
  - `media_mime`
  - `media_size`
  - `media_bucket`
  - `media_path`
  - `media_filename`
  - `media_download_error`
- Grava esses campos em `whatsapp_messages.metadata` e `activities.payload`.
- Se a mensagem já existia sem media, a RPC atualiza o metadata e o payload da activity pelo `wa_message_id`.

### 4. Frontend renderiza media nas bolhas

- [ConversationView.tsx](../src/components/whatsapp/ConversationView.tsx) renderiza:
  - audio com `<audio controls>`
  - imagem/sticker com `<img>` e preview modal
  - vídeo com `<video controls>`
  - documento com link/download
- [WhatsAppTimeline.tsx](../src/components/crm/WhatsAppTimeline.tsx) lê `metadata.media_url` mesmo quando não existem colunas físicas `media_url/audio_url`.

### 5. Fila da extensão ficou menos frágil

- [content_script.js](../extension/content_script.js) não esvazia mais a fila antes do sync.
- Se o service worker falhar, a primeira mensagem pendente fica na fila e a extensão agenda retry curto.

---

## O que rodar no Supabase

No SQL Editor, depois das migrations da Onda 0:

```sql
-- supabase/migrations/20260424_capture_whatsapp_media.sql
```

Pode rodar mais de uma vez. A migration usa `ON CONFLICT`, `DROP POLICY IF EXISTS` e `CREATE OR REPLACE FUNCTION`.

---

## Como testar

### Teste 1: bucket criado

```sql
select id, public, file_size_limit
  from storage.buckets
 where id = 'whatsapp-media';
```

Esperado: 1 linha, `public = true`.

### Teste 2: sync de media real

1. Recarrega a extensão em `chrome://extensions/`.
2. Abre `https://web.whatsapp.com/`.
3. Abre um chat aprovado no CRM.
4. Envia/recebe uma imagem, sticker ou áudio.
5. Abre `/mensagens` no CRM.

Esperado: a bolha mostra a media real, e áudio toca no browser.

### Teste 3: payload da activity

```sql
select
  payload->>'wa_message_id' as wa_message_id,
  payload->>'message_type' as message_type,
  payload->>'media_url' as media_url,
  payload->>'media_mime' as media_mime
from public.activities
where kind = 'whatsapp'
  and payload ? 'media_url'
order by occurred_at desc
limit 20;
```

Esperado: `media_url` preenchido para cada media capturada.

### Teste 4: Storage sem duplicar

```sql
select name, count(*)
from storage.objects
where bucket_id = 'whatsapp-media'
group by name
having count(*) > 1;
```

Esperado: zero linhas.

---

## Verificação local feita

- [x] `npx tsc --noEmit`
- [x] `node --check` em `extension/background.js`, `extension/content_script.js`, `extension/inject-wa.js`, `extension/lib/wa-bridge.js`
- [ ] Teste real no WhatsApp Web com dados de produção
- [ ] Migration rodada no Supabase Studio

---

## Limites conhecidos

- Media acima de 25 MB não é enviada como inline payload pela extensão; a mensagem continua salva com `media_download_error`.
- O bucket está público para simplificar renderização no CRM. Os paths são determinísticos e separados por owner/chat/message, mas qualquer pessoa com a URL consegue abrir o arquivo.
- O retry da fila ainda é em memória. IndexedDB fica para uma fase posterior se o service worker continuar perdendo mensagens em sessão longa.
