-- ============================================================
-- Pipa Driven — RPC para captura on-click da extensão
-- ============================================================
-- ATENÇÃO: esta migration alinha o schema existente (RODAR_TUDO.sql)
-- com a captura on-click da extensão. Ela é IDEMPOTENTE: adiciona
-- colunas apenas quando faltam e usa CREATE OR REPLACE.
--
-- Tabelas usadas (schema real, após RODAR_TUDO.sql):
--   - contacts(id, name, whatsapp, owner_id, source, company_id, ...)
--   - whatsapp_conversations(id, contact_id, company_id, phone_number, source, ...)
--   - whatsapp_messages(id, conversation_id NOT NULL, direction, body,
--                        wa_message_id UNIQUE, sent_at, contact_id, company_id)
-- ============================================================

-- 1. Extensões novas em `contacts` para contatos órfãos
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS is_orphan boolean NOT NULL DEFAULT false;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS wa_push_name text;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS wa_profile_pic_url text;

-- Unicidade parcial no whatsapp (permite múltiplos NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS contacts_whatsapp_unique
  ON public.contacts (whatsapp)
  WHERE whatsapp IS NOT NULL;

-- 2. Extensões novas em `whatsapp_conversations` para dedup por chat_id
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS wa_chat_id text;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_conversations_wa_chat_id_key
  ON public.whatsapp_conversations (wa_chat_id)
  WHERE wa_chat_id IS NOT NULL;

-- 3. Garantir que `whatsapp_messages.wa_message_id` tem índice UNIQUE completo.
-- IMPORTANTE: índice PARCIAL (WHERE wa_message_id IS NOT NULL) não casa com
-- `ON CONFLICT (wa_message_id)` sem predicate repetido. Usamos índice cheio.
-- NULLs continuam permitidos (UNIQUE trata NULL como distinto).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_index i
      JOIN pg_class c  ON c.oid = i.indrelid
      JOIN pg_class ic ON ic.oid = i.indexrelid
     WHERE c.relname = 'whatsapp_messages'
       AND c.relnamespace = 'public'::regnamespace
       AND i.indisunique = true
       AND i.indpred IS NULL
       AND array_length(i.indkey, 1) = 1
       AND (
         SELECT attname FROM pg_attribute
          WHERE attrelid = c.oid AND attnum = i.indkey[0]
       ) = 'wa_message_id'
  ) THEN
    CREATE UNIQUE INDEX whatsapp_messages_wa_message_id_key
      ON public.whatsapp_messages (wa_message_id);
  END IF;
END $$;

-- 4. Campo para guardar tipo original (text/audio/image/...) e from_me
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS message_type text;

-- 4.05 Campos necessários pro frontend exibir a timeline (chat_key lookup)
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS chat_key text;
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS message_fingerprint text;
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz;

ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS chat_key text;

CREATE INDEX IF NOT EXISTS idx_wa_msg_chat_key ON public.whatsapp_messages (chat_key);

-- 4.0 Normaliza CHECK constraints em `direction`. Podem existir várias
-- (auto-nomeadas _check, _check1, ...) com listas conflitantes se mais
-- de um migration criou a coluna. Dropa todas e recria uma única
-- permissiva que aceita os dois dialetos históricos.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'whatsapp_messages'
       AND t.relnamespace = 'public'::regnamespace
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%direction%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.whatsapp_messages DROP CONSTRAINT %I',
      r.conname
    );
  END LOOP;
END $$;

ALTER TABLE public.whatsapp_messages
  ADD CONSTRAINT whatsapp_messages_direction_check
  CHECK (direction IS NULL OR direction IN ('inbound','outbound','in','out'));

-- 4.1 Afrouxa NOT NULLs herdados de schemas antigos em whatsapp_messages
-- que a função NÃO preenche (chat_key do whatsapp_conversations.sql é o
-- caso mais comum). Idempotente — colunas ausentes são ignoradas.
DO $$
DECLARE
  col text;
BEGIN
  FOREACH col IN ARRAY ARRAY[
    'body',
    'conversation_id',
    'chat_key',
    'chat_id',
    'message_fingerprint',
    'occurred_at',
    'metadata',
    'transcription_status',
    'created_at',
    'updated_at',
    'direction',
    'message_type',
    'raw_id',
    'type',
    'content_md',
    'content'
  ] LOOP
    BEGIN
      EXECUTE format(
        'ALTER TABLE public.whatsapp_messages ALTER COLUMN %I DROP NOT NULL',
        col
      );
    EXCEPTION
      WHEN undefined_column THEN NULL;
      WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

-- 5. RPC: ingest_whatsapp_chat
-- ------------------------------------------------------------
-- p_chat:    { chat_id, number_e164, display_name, push_name, profile_pic_url }
-- p_messages: [{ wa_msg_id, chat_id, from_me, author, type, body, timestamp, has_media, quoted_msg_id }]
-- Retorna:   contact_id, contact_created, messages_inserted, messages_skipped
-- ------------------------------------------------------------

DROP FUNCTION IF EXISTS public.ingest_whatsapp_chat(jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.ingest_whatsapp_chat(
  p_chat     jsonb,
  p_messages jsonb
)
RETURNS TABLE (
  out_contact_id     uuid,
  contact_created    boolean,
  messages_inserted  integer,
  messages_skipped   integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_number_e164    text := p_chat->>'number_e164';
  v_wa_chat_id     text := p_chat->>'chat_id';
  v_display_name   text := coalesce(nullif(p_chat->>'display_name',''), v_number_e164);
  v_push_name      text := p_chat->>'push_name';
  v_pic_url        text := p_chat->>'profile_pic_url';
  v_contact_id     uuid;
  v_company_id     uuid;
  v_conversation_id uuid;
  v_created        boolean := false;
  v_inserted       integer := 0;
  v_skipped        integer := 0;
  v_owner          uuid := auth.uid();
  v_msg            jsonb;
  v_wa_msg_id      text;
  v_direction      text;
  v_type           text;
  v_body           text;
  v_ts             timestamptz;
  v_ins            uuid;
BEGIN
  -- Sem owner autenticado não dá pra criar órfão (owner_id é NOT NULL)
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'usuário não autenticado';
  END IF;

  IF v_number_e164 IS NULL OR length(v_number_e164) < 4 THEN
    RAISE EXCEPTION 'número E.164 ausente ou inválido';
  END IF;

  -- ── 1. Resolver contato ─────────────────────────────────────
  SELECT c.id, c.company_id
    INTO v_contact_id, v_company_id
  FROM public.contacts c
  WHERE c.whatsapp = v_number_e164
  LIMIT 1;

  IF v_contact_id IS NULL THEN
    INSERT INTO public.contacts (
      name, whatsapp, owner_id, source, is_orphan,
      wa_push_name, wa_profile_pic_url
    )
    VALUES (
      v_display_name, v_number_e164, v_owner, 'whatsapp_capture', true,
      v_push_name, v_pic_url
    )
    RETURNING id, company_id INTO v_contact_id, v_company_id;
    v_created := true;
  ELSE
    UPDATE public.contacts
       SET wa_push_name       = COALESCE(wa_push_name, v_push_name),
           wa_profile_pic_url = COALESCE(wa_profile_pic_url, v_pic_url)
     WHERE id = v_contact_id;
  END IF;

  -- ── 2. Resolver / criar conversa ────────────────────────────
  SELECT wc.id INTO v_conversation_id
    FROM public.whatsapp_conversations wc
   WHERE wc.wa_chat_id = v_wa_chat_id
   LIMIT 1;

  IF v_conversation_id IS NULL THEN
    -- fallback: talvez já exista uma conversa pelo contact_id + phone
    SELECT wc.id INTO v_conversation_id
      FROM public.whatsapp_conversations wc
     WHERE wc.contact_id = v_contact_id
       AND coalesce(wc.phone_number,'') = coalesce(v_number_e164,'')
     ORDER BY wc.created_at DESC
     LIMIT 1;
  END IF;

  IF v_conversation_id IS NULL THEN
    INSERT INTO public.whatsapp_conversations (
      contact_id, company_id, source, phone_number,
      raw_text, wa_chat_id, chat_key, created_by
    )
    VALUES (
      v_contact_id, v_company_id, 'extension', v_number_e164,
      null, v_wa_chat_id, v_wa_chat_id, v_owner
    )
    RETURNING id INTO v_conversation_id;
  ELSE
    UPDATE public.whatsapp_conversations AS wc
       SET wa_chat_id   = COALESCE(wc.wa_chat_id, v_wa_chat_id),
           chat_key     = COALESCE(wc.chat_key, v_wa_chat_id),
           phone_number = COALESCE(wc.phone_number, v_number_e164),
           contact_id   = COALESCE(wc.contact_id, v_contact_id)
     WHERE wc.id = v_conversation_id;
  END IF;

  -- ── 3. Iterar mensagens ─────────────────────────────────────
  FOR v_msg IN SELECT * FROM jsonb_array_elements(coalesce(p_messages, '[]'::jsonb))
  LOOP
    v_wa_msg_id := v_msg->>'wa_msg_id';
    v_direction := CASE WHEN (v_msg->>'from_me')::boolean THEN 'outbound' ELSE 'inbound' END;
    v_type      := coalesce(v_msg->>'type', 'text');
    v_body      := coalesce(v_msg->>'body', '');

    BEGIN
      v_ts := (v_msg->>'timestamp')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      v_ts := now();
    END;

    IF v_wa_msg_id IS NULL OR v_wa_msg_id = '' THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.whatsapp_messages (
      conversation_id, contact_id, company_id,
      direction, body, wa_message_id, sent_at, message_type,
      chat_key, message_fingerprint, occurred_at
    )
    VALUES (
      v_conversation_id, v_contact_id, v_company_id,
      v_direction, v_body, v_wa_msg_id, v_ts, v_type,
      v_wa_chat_id, v_wa_msg_id, v_ts
    )
    ON CONFLICT (wa_message_id) DO NOTHING
    RETURNING id INTO v_ins;

    IF v_ins IS NOT NULL THEN
      v_inserted := v_inserted + 1;

      -- Dual-write na timeline unificada (activities).
      BEGIN
        INSERT INTO public.activities (
          kind, subject, body, direction, occurred_at, created_by,
          contact_id, company_id, payload
        )
        VALUES (
          'whatsapp',
          NULL,
          v_body,
          CASE WHEN v_direction = 'outbound' THEN 'out' ELSE 'in' END,
          v_ts,
          v_owner,
          v_contact_id,
          v_company_id,
          jsonb_build_object(
            'wa_message_id', v_wa_msg_id,
            'wa_chat_id',    v_wa_chat_id,
            'message_type',  v_type
          )
        )
        ON CONFLICT DO NOTHING;
      EXCEPTION
        WHEN undefined_table THEN NULL;
        WHEN undefined_column THEN NULL;
      END;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_contact_id, v_created, v_inserted, v_skipped;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ingest_whatsapp_chat(jsonb, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.ingest_whatsapp_chat(jsonb, jsonb) FROM anon, public;
