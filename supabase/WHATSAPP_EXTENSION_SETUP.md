## WhatsApp Capture MVP Setup

Escopo deste setup:

- capturar texto do WhatsApp
- armazenar mensagens individuais no CRM
- suportar audio via Storage
- suportar fila assíncrona de transcrição

Fora de escopo neste MVP:

- resposta automática
- cadência automática
- automação outbound
- edge functions obrigatórias

## Contrato final criado

O arquivo `supabase/whatsapp_conversations.sql` consolida o contrato do banco para o MVP e garante:

- `chat_key` como identificador canônico do chat
- `whatsapp_conversations` para o envelope do chat
- `whatsapp_messages` para mensagens individuais com:
  - `chat_key`
  - `company_id`
  - `contact_id`
  - `direction`
  - `message_type`
  - `occurred_at`
  - `body`
  - `message_fingerprint`
- `whatsapp_message_media` para anexos, incluindo áudio
- `transcription_jobs` para a fila assíncrona de transcrição
- bucket `whatsapp-audio`
- dedupe por `chat_key + provider_message_id`
- dedupe por `chat_key + message_fingerprint`
- RLS de leitura/escrita para usuários autenticados

## Ordem exata de execução no Supabase

### 0. Auditar producao sem alterar dados

Antes de aplicar qualquer fix em um banco ja usado, rode:

`supabase/whatsapp_crm_readonly_audit.sql`

Esse script:

- inventaria tabelas, colunas, RPC, indexes e policies
- aponta conversas/mensagens sem `chat_key`
- aponta duplicatas por `chat_key` e `provider_message_id`
- identifica tabelas legadas (`chats`, `monitored_chats`)
- faz `rollback` ao final

### 1. Garantir pré-requisitos do CRM

O projeto precisa já ter estas tabelas:

- `public.profiles`
- `public.companies`
- `public.contacts`

Se o projeto ainda não tiver a base CRM, execute antes:

`supabase/setup_completo.sql`

Se essas tabelas já existem, nao rode nada adicional nesta etapa.

### 2. Executar o SQL do MVP de captura

No SQL Editor do Supabase, execute:

`supabase/whatsapp_conversations.sql`

Esse script é idempotente e:

- cria ou normaliza tabelas
- cria ou normaliza índices
- cria dedupe
- cria bucket de áudio
- cria policies RLS
- adiciona triggers de rollup do chat

### 3. Aplicar o fix de espelhamento por chat_key

Se o CRM ja mostra conversas salvas, mas sem mensagens individuais, execute:

`supabase/migrations/20260424_fix_whatsapp_ingest_chat_key.sql`

Esse fix e o contrato usado pela extensao atual:

- `p_chat.chat_key` vira o identificador canonico da conversa
- `p_messages[].chat_key` e gravado em cada mensagem
- `wa_chat_id` continua como compatibilidade legada
- a RPC oficial permanece `public.ingest_whatsapp_chat(p_chat jsonb, p_messages jsonb)`

### 4. Rodar os smoke tests autenticados

No SQL Editor do Supabase, execute:

`supabase/whatsapp_capture_smoke_test.sql`

O smoke test:

- simula um usuário autenticado
- faz insert de conversa
- faz insert de mensagem
- faz insert de mídia
- cria `transcription_job`
- valida leitura autenticada
- valida bloqueio de duplicata
- faz `rollback` no final

Depois execute:

`supabase/whatsapp_ingest_rpc_smoke_test.sql`

Esse segundo smoke test chama a mesma RPC que a extensao usa, valida insert por `chat_key`, valida dedupe e tambem faz `rollback`.

## Fluxo operacional do MVP

### Texto

1. a extensão resolve ou informa `company_id` e `contact_id`
2. grava `chat_key`
3. insere a mensagem em `whatsapp_messages`
4. o banco cria/atualiza o envelope em `whatsapp_conversations`

### Áudio

1. a extensão grava a mensagem primeiro em `whatsapp_messages` com `message_type = 'audio'`
2. faz upload do arquivo para o bucket `whatsapp-audio`
3. grava o metadado em `whatsapp_message_media`
4. enfileira a transcrição em `transcription_jobs`
5. falha de transcrição nao invalida a captura

## Convenções recomendadas

### `chat_key`

Use um identificador estável do chat no provedor. Exemplos:

- JID do WhatsApp
- número E.164 + sufixo do provedor
- thread id persistente do canal

### `message_fingerprint`

Quando o provedor não entregar um id único de mensagem, gere o fingerprint com base em algo estável como:

- `chat_key`
- `direction`
- `message_type`
- `occurred_at`
- `body`
- hash do binário, se houver mídia

### Bucket de áudio

Bucket criado pelo script:

- `whatsapp-audio`

Caminho sugerido:

- `company/{company_id}/chat/{chat_key}/message/{message_id}/audio.ogg`

## Queries de verificação rápida

### Confirmar tabelas

```sql
select
  to_regclass('public.whatsapp_conversations') as whatsapp_conversations,
  to_regclass('public.whatsapp_messages') as whatsapp_messages,
  to_regclass('public.whatsapp_message_media') as whatsapp_message_media,
  to_regclass('public.transcription_jobs') as transcription_jobs;
```

### Confirmar bucket de áudio

```sql
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'whatsapp-audio';
```

### Confirmar dedupe de mensagem

```sql
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('whatsapp_messages', 'whatsapp_message_media', 'transcription_jobs')
order by tablename, indexname;
```

### Confirmar RLS

```sql
select schemaname, tablename, policyname, permissive, roles, cmd
from pg_policies
where schemaname in ('public', 'storage')
  and (
    tablename in (
      'whatsapp_conversations',
      'whatsapp_messages',
      'whatsapp_message_media',
      'transcription_jobs'
    )
    or tablename = 'objects'
  )
order by schemaname, tablename, policyname;
```

### Confirmar últimos registros capturados

```sql
select
  c.chat_key,
  c.message_count,
  c.last_message_at,
  m.direction,
  m.message_type,
  m.occurred_at,
  m.transcription_status
from public.whatsapp_conversations c
left join public.whatsapp_messages m on m.conversation_id = c.id
order by c.updated_at desc, m.occurred_at desc
limit 50;
```

## Smoke test obrigatório

Arquivo:

`supabase/whatsapp_capture_smoke_test.sql`

Esse é o teste de referência para validar os critérios de pronto:

1. insert manual autenticado em conversa
2. insert manual autenticado em mensagem
3. insert de media
4. criação de `transcription_job`
5. leitura autenticada dos dados
6. tentativa de duplicata barrada

## O que não é necessário para este MVP

Nao configure:

- secrets de IA
- deploy de edge function
- webhook de automação comercial
- `supabase/whatsapp_automation.sql`

O MVP de captura funciona apenas com:

- schema SQL
- Storage
- cliente autenticado
