-- ============================================================
-- Fix WhatsApp mirror ingestion by canonical chat_key
-- ============================================================
-- The extension calls public.ingest_whatsapp_chat. Older versions of
-- that RPC wrote only wa_chat_id/conversation_id, while the operational
-- CRM timeline reads whatsapp_conversations.chat_key and
-- whatsapp_messages.chat_key. This migration normalizes legacy rows and
-- replaces the RPC so every captured chat/message is mirrored by chat_key.
-- ============================================================

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS is_orphan boolean NOT NULL DEFAULT false;
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS wa_push_name text;
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS wa_profile_pic_url text;

CREATE INDEX IF NOT EXISTS contacts_whatsapp_lookup_idx
  ON public.contacts (whatsapp)
  WHERE whatsapp IS NOT NULL;

ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS wa_chat_id text;
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS chat_key text;
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS content_hash text;
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'extension';
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS raw_text text;
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS message_count integer DEFAULT 0;
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz;
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS last_message_preview text;
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS ingestion_status text;
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS ingestion_error text;
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_chat_key
  ON public.whatsapp_conversations (chat_key);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_wa_chat_id
  ON public.whatsapp_conversations (wa_chat_id)
  WHERE wa_chat_id IS NOT NULL;

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS wa_message_id text;
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS provider_message_id text;
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS conversation_id uuid;
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS chat_key text;
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS chat_id text;
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS contact_id uuid;
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS direction text;
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS body text;
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz;
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS message_type text;
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS message_fingerprint text;
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_wa_msg_chat_key
  ON public.whatsapp_messages (chat_key);
CREATE INDEX IF NOT EXISTS idx_wa_msg_conversation_id
  ON public.whatsapp_messages (conversation_id);

DO $$
DECLARE
  col text;
BEGIN
  FOREACH col IN ARRAY ARRAY[
    'chat_key', 'raw_text', 'message_count', 'created_at', 'updated_at',
    'title', 'last_message_at', 'last_message_preview'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.whatsapp_conversations ALTER COLUMN %I DROP NOT NULL', col);
    EXCEPTION
      WHEN undefined_column THEN NULL;
      WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  FOREACH col IN ARRAY ARRAY[
    'body', 'conversation_id', 'chat_key', 'chat_id', 'message_fingerprint',
    'occurred_at', 'metadata', 'created_at', 'updated_at', 'direction',
    'message_type', 'raw_id', 'type', 'content_md', 'content'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.whatsapp_messages ALTER COLUMN %I DROP NOT NULL', col);
    EXCEPTION
      WHEN undefined_column THEN NULL;
      WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

UPDATE public.whatsapp_conversations
SET chat_key = COALESCE(
    NULLIF(BTRIM(chat_key), ''),
    CASE
      WHEN NULLIF(BTRIM(COALESCE(wa_chat_id, '')), '') IS NOT NULL THEN 'wa:' || BTRIM(wa_chat_id)
      WHEN NULLIF(regexp_replace(COALESCE(phone_number, ''), '[^0-9]', '', 'g'), '') IS NOT NULL
        THEN 'phone:' || regexp_replace(phone_number, '[^0-9]', '', 'g')
      ELSE 'legacy:' || id::text
    END
  ),
  source = COALESCE(NULLIF(BTRIM(source), ''), 'extension'),
  message_count = COALESCE(message_count, 0),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, created_at, now())
WHERE chat_key IS NULL OR BTRIM(chat_key) = ''
   OR source IS NULL OR BTRIM(source) = ''
   OR message_count IS NULL
   OR created_at IS NULL
   OR updated_at IS NULL;

UPDATE public.whatsapp_messages wm
SET
  chat_key = COALESCE(NULLIF(BTRIM(wm.chat_key), ''), wc.chat_key),
  conversation_id = COALESCE(wm.conversation_id, wc.id),
  company_id = COALESCE(wm.company_id, wc.company_id),
  contact_id = COALESCE(wm.contact_id, wc.contact_id)
FROM public.whatsapp_conversations wc
WHERE (
    wm.conversation_id = wc.id
    OR (wm.conversation_id IS NULL AND wm.chat_id IS NOT NULL AND wm.chat_id = wc.wa_chat_id)
  )
  AND (
    wm.chat_key IS NULL OR BTRIM(wm.chat_key) = ''
    OR wm.conversation_id IS NULL
    OR wm.company_id IS NULL
    OR wm.contact_id IS NULL
  );

UPDATE public.whatsapp_messages
SET
  provider_message_id = COALESCE(provider_message_id, wa_message_id),
  occurred_at = COALESCE(occurred_at, sent_at, created_at, now()),
  body = COALESCE(body, ''),
  message_type = COALESCE(NULLIF(BTRIM(message_type), ''), 'text'),
  metadata = COALESCE(metadata, '{}'::jsonb),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, created_at, now())
WHERE provider_message_id IS NULL
   OR occurred_at IS NULL
   OR body IS NULL
   OR message_type IS NULL OR BTRIM(message_type) = ''
   OR metadata IS NULL
   OR created_at IS NULL
   OR updated_at IS NULL;

UPDATE public.whatsapp_messages
SET chat_key = 'legacy:' || COALESCE(conversation_id::text, id::text)
WHERE chat_key IS NULL OR BTRIM(chat_key) = '';

UPDATE public.whatsapp_messages
SET message_fingerprint = md5(
  COALESCE(chat_key, '') || '|' ||
  COALESCE(provider_message_id, wa_message_id, '') || '|' ||
  COALESCE(direction, '') || '|' ||
  COALESCE(message_type, '') || '|' ||
  COALESCE(body, '') || '|' ||
  COALESCE(occurred_at::text, '')
)
WHERE message_fingerprint IS NULL OR BTRIM(message_fingerprint) = '';

ALTER TABLE public.whatsapp_messages
  DROP CONSTRAINT IF EXISTS whatsapp_messages_wa_message_id_key;
DROP INDEX IF EXISTS public.whatsapp_messages_wa_message_id_key;

DELETE FROM public.whatsapp_messages a
 USING public.whatsapp_messages b
 WHERE a.wa_message_id IS NOT NULL
   AND a.wa_message_id = b.wa_message_id
   AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_wa_message_id_key
  ON public.whatsapp_messages (wa_message_id);

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
    EXECUTE format('ALTER TABLE public.whatsapp_messages DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.whatsapp_messages
  ADD CONSTRAINT whatsapp_messages_direction_check
  CHECK (direction IS NULL OR direction IN ('inbound','outbound','in','out'));

DROP FUNCTION IF EXISTS public.ingest_whatsapp_chat(jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.ingest_whatsapp_chat(
  p_chat jsonb,
  p_messages jsonb
)
RETURNS TABLE (
  out_contact_id uuid,
  contact_created boolean,
  messages_inserted integer,
  messages_skipped integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_number_e164 text := NULLIF(BTRIM(COALESCE(p_chat->>'number_e164', '')), '');
  v_wa_chat_id text := NULLIF(BTRIM(COALESCE(p_chat->>'chat_id', '')), '');
  v_chat_key text := NULLIF(BTRIM(COALESCE(p_chat->>'chat_key', '')), '');
  v_display_name text := COALESCE(NULLIF(BTRIM(p_chat->>'display_name'), ''), v_number_e164, v_wa_chat_id);
  v_push_name text := NULLIF(BTRIM(COALESCE(p_chat->>'push_name', '')), '');
  v_pic_url text := NULLIF(BTRIM(COALESCE(p_chat->>'profile_pic_url', '')), '');
  v_contact_id uuid;
  v_company_id uuid;
  v_conversation_id uuid;
  v_created boolean := false;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_owner uuid := auth.uid();
  v_msg jsonb;
  v_wa_msg_id text;
  v_msg_chat_key text;
  v_direction text;
  v_type text;
  v_body text;
  v_ts timestamptz;
  v_fingerprint text;
  v_existing uuid;
  v_ins uuid;
  v_message_count integer;
  v_last_message_at timestamptz;
  v_last_message_preview text;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'usuario nao autenticado';
  END IF;

  IF (v_number_e164 IS NULL OR v_number_e164 = '') AND v_wa_chat_id IS NOT NULL AND v_wa_chat_id !~* '@g\.us' THEN
    v_number_e164 := '+' || regexp_replace(v_wa_chat_id, '[^0-9]', '', 'g');
  END IF;

  IF v_number_e164 IS NOT NULL AND v_number_e164 !~ '^\+' THEN
    v_number_e164 := '+' || regexp_replace(v_number_e164, '[^0-9]', '', 'g');
  END IF;

  IF v_number_e164 IS NULL OR length(regexp_replace(v_number_e164, '[^0-9]', '', 'g')) < 4 THEN
    RAISE EXCEPTION 'numero E.164 ausente ou invalido';
  END IF;

  IF v_chat_key IS NULL THEN
    IF v_wa_chat_id IS NOT NULL THEN
      v_chat_key := 'wa:' || v_wa_chat_id;
    ELSE
      v_chat_key := 'phone:' || regexp_replace(v_number_e164, '[^0-9]', '', 'g');
    END IF;
  END IF;

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
      COALESCE(v_display_name, v_number_e164), v_number_e164, v_owner,
      'whatsapp_capture', true, v_push_name, v_pic_url
    )
    RETURNING id, company_id INTO v_contact_id, v_company_id;
    v_created := true;
  ELSE
    UPDATE public.contacts
       SET wa_push_name = COALESCE(wa_push_name, v_push_name),
           wa_profile_pic_url = COALESCE(wa_profile_pic_url, v_pic_url)
     WHERE id = v_contact_id;
  END IF;

  SELECT wc.id
    INTO v_conversation_id
  FROM public.whatsapp_conversations wc
  WHERE wc.chat_key = v_chat_key
  ORDER BY wc.created_at DESC
  LIMIT 1;

  IF v_conversation_id IS NULL AND v_wa_chat_id IS NOT NULL THEN
    SELECT wc.id
      INTO v_conversation_id
    FROM public.whatsapp_conversations wc
    WHERE wc.wa_chat_id = v_wa_chat_id
    ORDER BY wc.created_at DESC
    LIMIT 1;
  END IF;

  IF v_conversation_id IS NULL THEN
    SELECT wc.id
      INTO v_conversation_id
    FROM public.whatsapp_conversations wc
    WHERE wc.contact_id = v_contact_id
      AND COALESCE(wc.phone_number, '') = COALESCE(v_number_e164, '')
    ORDER BY wc.created_at DESC
    LIMIT 1;
  END IF;

  IF v_conversation_id IS NULL THEN
    INSERT INTO public.whatsapp_conversations (
      chat_key, contact_id, company_id, source, phone_number, title,
      raw_text, wa_chat_id, created_by, ingestion_status
    )
    VALUES (
      v_chat_key, v_contact_id, v_company_id, 'extension', v_number_e164,
      v_display_name, NULL, v_wa_chat_id, v_owner, 'saved'
    )
    RETURNING id INTO v_conversation_id;
  ELSE
    UPDATE public.whatsapp_conversations AS wc
       SET chat_key = COALESCE(NULLIF(BTRIM(wc.chat_key), ''), v_chat_key),
           wa_chat_id = COALESCE(NULLIF(BTRIM(wc.wa_chat_id), ''), v_wa_chat_id),
           phone_number = COALESCE(wc.phone_number, v_number_e164),
           title = COALESCE(NULLIF(BTRIM(wc.title), ''), v_display_name),
           contact_id = COALESCE(wc.contact_id, v_contact_id),
           company_id = COALESCE(wc.company_id, v_company_id),
           source = COALESCE(NULLIF(BTRIM(wc.source), ''), 'extension'),
           ingestion_status = COALESCE(NULLIF(BTRIM(wc.ingestion_status), ''), 'saved'),
           updated_at = now()
     WHERE wc.id = v_conversation_id;
  END IF;

  FOR v_msg IN SELECT * FROM jsonb_array_elements(COALESCE(p_messages, '[]'::jsonb))
  LOOP
    v_wa_msg_id := COALESCE(
      NULLIF(BTRIM(v_msg->>'wa_msg_id'), ''),
      NULLIF(BTRIM(v_msg->>'provider_message_id'), ''),
      NULLIF(BTRIM(v_msg->>'raw_id'), ''),
      NULLIF(BTRIM(v_msg->>'id'), '')
    );
    v_msg_chat_key := COALESCE(NULLIF(BTRIM(v_msg->>'chat_key'), ''), v_chat_key);
    v_type := LOWER(COALESCE(NULLIF(BTRIM(v_msg->>'type'), ''), 'text'));
    IF v_type IN ('ptt', 'voice') THEN
      v_type := 'audio';
    END IF;
    v_body := COALESCE(v_msg->>'body', v_msg->>'text', v_msg->>'content_md', '');

    v_direction := CASE
      WHEN LOWER(COALESCE(v_msg->>'direction', '')) IN ('out', 'outbound', 'sent', 'from_me', 'true') THEN 'outbound'
      WHEN LOWER(COALESCE(v_msg->>'direction', '')) IN ('in', 'inbound', 'received', 'false') THEN 'inbound'
      WHEN LOWER(COALESCE(v_msg->>'from_me', 'false')) IN ('true', 't', '1', 'yes') THEN 'outbound'
      ELSE 'inbound'
    END;

    BEGIN
      v_ts := COALESCE(v_msg->>'timestamp', v_msg->>'timestamp_wa', now()::text)::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      v_ts := now();
    END;

    IF v_wa_msg_id IS NULL OR v_wa_msg_id = '' THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_fingerprint := COALESCE(
      NULLIF(BTRIM(v_msg->>'message_fingerprint'), ''),
      md5(
        COALESCE(v_msg_chat_key, '') || '|' ||
        COALESCE(v_wa_msg_id, '') || '|' ||
        COALESCE(v_direction, '') || '|' ||
        COALESCE(v_type, '') || '|' ||
        COALESCE(v_body, '') || '|' ||
        COALESCE(v_ts::text, '')
      )
    );

    v_existing := NULL;
    UPDATE public.whatsapp_messages AS wm
       SET conversation_id = COALESCE(wm.conversation_id, v_conversation_id),
           chat_key = COALESCE(NULLIF(BTRIM(wm.chat_key), ''), v_msg_chat_key),
           chat_id = COALESCE(NULLIF(BTRIM(wm.chat_id), ''), v_wa_chat_id),
           contact_id = COALESCE(wm.contact_id, v_contact_id),
           company_id = COALESCE(wm.company_id, v_company_id),
           provider_message_id = COALESCE(wm.provider_message_id, v_wa_msg_id),
           occurred_at = COALESCE(wm.occurred_at, v_ts),
           sent_at = COALESCE(wm.sent_at, v_ts),
           message_fingerprint = COALESCE(NULLIF(BTRIM(wm.message_fingerprint), ''), v_fingerprint),
           metadata = COALESCE(wm.metadata, '{}'::jsonb) || jsonb_build_object('wa_chat_id', v_wa_chat_id),
           updated_at = now()
     WHERE wm.wa_message_id = v_wa_msg_id
     RETURNING wm.id INTO v_existing;

    IF v_existing IS NOT NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_ins := NULL;
    INSERT INTO public.whatsapp_messages (
      conversation_id, chat_key, chat_id, contact_id, company_id,
      direction, body, wa_message_id, provider_message_id, sent_at,
      occurred_at, message_type, message_fingerprint, metadata, created_by
    )
    VALUES (
      v_conversation_id, v_msg_chat_key, v_wa_chat_id, v_contact_id, v_company_id,
      v_direction, v_body, v_wa_msg_id, v_wa_msg_id, v_ts,
      v_ts, v_type, v_fingerprint,
      jsonb_build_object(
        'wa_chat_id', v_wa_chat_id,
        'author', v_msg->>'author',
        'quoted_msg_id', v_msg->>'quoted_msg_id',
        'has_media', v_msg->>'has_media'
      ),
      v_owner
    )
    ON CONFLICT (wa_message_id) DO NOTHING
    RETURNING id INTO v_ins;

    IF v_ins IS NOT NULL THEN
      v_inserted := v_inserted + 1;

      -- Dual-write na timeline unificada (activities). A tabela
      -- activities é criada pela migration 20260424_activities_table.sql.
      -- Protegido contra falha caso a migration nao tenha rodado.
      BEGIN
        INSERT INTO public.activities (
          kind, body, direction, occurred_at, created_by,
          contact_id, company_id, payload
        )
        VALUES (
          'whatsapp',
          v_body,
          CASE WHEN v_direction = 'outbound' THEN 'out' ELSE 'in' END,
          v_ts,
          v_owner,
          v_contact_id,
          v_company_id,
          jsonb_build_object(
            'wa_message_id', v_wa_msg_id,
            'wa_chat_id',    v_wa_chat_id,
            'chat_key',      v_msg_chat_key,
            'message_type',  v_type,
            'author',        v_msg->>'author',
            'quoted_msg_id', v_msg->>'quoted_msg_id',
            'has_media',     v_msg->>'has_media'
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

  SELECT
    COUNT(*)::integer,
    MAX(COALESCE(occurred_at, sent_at, created_at)),
    (ARRAY_AGG(
      LEFT(
        CASE
          WHEN COALESCE(NULLIF(body, ''), '') <> '' THEN body
          ELSE '[' || COALESCE(message_type, 'unknown') || ']'
        END,
        280
      )
      ORDER BY COALESCE(occurred_at, sent_at, created_at) DESC
    ))[1]
  INTO v_message_count, v_last_message_at, v_last_message_preview
  FROM public.whatsapp_messages
  WHERE chat_key = v_chat_key OR conversation_id = v_conversation_id;

  UPDATE public.whatsapp_conversations
     SET message_count = COALESCE(v_message_count, 0),
         last_message_at = v_last_message_at,
         last_message_preview = v_last_message_preview,
         updated_at = now()
   WHERE id = v_conversation_id;

  RETURN QUERY SELECT v_contact_id, v_created, v_inserted, v_skipped;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ingest_whatsapp_chat(jsonb, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.ingest_whatsapp_chat(jsonb, jsonb) FROM anon, public;
