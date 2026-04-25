-- ============================================================
-- Phase 1A.2 — Captura de media real do WhatsApp
-- ============================================================
-- Cria o bucket publico usado pela extensao e substitui a RPC
-- ingest_whatsapp_chat para persistir media_url/media_mime/media_size
-- no JSONB metadata e no payload da timeline unificada.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-media',
  'whatsapp-media',
  true,
  52428800,
  ARRAY[
    'audio/aac',
    'audio/amr',
    'audio/mpeg',
    'audio/mp4',
    'audio/ogg',
    'audio/opus',
    'audio/wav',
    'audio/webm',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'application/msword',
    'application/octet-stream',
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "whatsapp_media_authenticated_read" ON storage.objects;
DROP POLICY IF EXISTS "whatsapp_media_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "whatsapp_media_authenticated_update" ON storage.objects;

CREATE POLICY "whatsapp_media_authenticated_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'whatsapp-media');

CREATE POLICY "whatsapp_media_authenticated_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'whatsapp-media');

CREATE POLICY "whatsapp_media_authenticated_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'whatsapp-media')
  WITH CHECK (bucket_id = 'whatsapp-media');

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
  v_has_media boolean;
  v_media_url text;
  v_media_mime text;
  v_media_size bigint;
  v_media_size_text text;
  v_media_bucket text;
  v_media_path text;
  v_media_filename text;
  v_media_download_error text;
  v_metadata jsonb;
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
    v_type := LOWER(COALESCE(
      NULLIF(BTRIM(v_msg->>'media_type'), ''),
      NULLIF(BTRIM(v_msg->>'type'), ''),
      'text'
    ));
    IF v_type IN ('ptt', 'voice') THEN
      v_type := 'audio';
    ELSIF v_type = 'chat' THEN
      v_type := 'text';
    END IF;

    v_body := COALESCE(v_msg->>'body', v_msg->>'text', v_msg->>'content_md', '');
    v_has_media := LOWER(COALESCE(v_msg->>'has_media', 'false')) IN ('true', 't', '1', 'yes')
      OR v_type IN ('audio', 'image', 'video', 'document', 'sticker', 'media');
    v_media_url := NULLIF(BTRIM(COALESCE(v_msg->>'media_url', '')), '');
    v_media_mime := NULLIF(BTRIM(COALESCE(v_msg->>'media_mime', v_msg->>'mime_type', '')), '');
    v_media_size_text := NULLIF(BTRIM(COALESCE(v_msg->>'media_size', v_msg->>'media_size_bytes', '')), '');
    v_media_size := CASE
      WHEN v_media_size_text ~ '^[0-9]+$' THEN v_media_size_text::bigint
      ELSE NULL
    END;
    v_media_bucket := NULLIF(BTRIM(COALESCE(v_msg->>'media_bucket', '')), '');
    v_media_path := NULLIF(BTRIM(COALESCE(v_msg->>'media_path', '')), '');
    v_media_filename := NULLIF(BTRIM(COALESCE(v_msg->>'media_filename', v_msg->>'file_name', '')), '');
    v_media_download_error := NULLIF(BTRIM(COALESCE(v_msg->>'media_download_error', '')), '');

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

    v_metadata := jsonb_strip_nulls(jsonb_build_object(
      'wa_message_id', v_wa_msg_id,
      'wa_chat_id', v_wa_chat_id,
      'chat_key', v_msg_chat_key,
      'message_type', v_type,
      'author', v_msg->>'author',
      'quoted_msg_id', v_msg->>'quoted_msg_id',
      'has_media', v_has_media,
      'media_url', v_media_url,
      'media_mime', v_media_mime,
      'media_size', v_media_size,
      'media_bucket', v_media_bucket,
      'media_path', v_media_path,
      'media_filename', v_media_filename,
      'media_download_error', v_media_download_error
    ));

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
           metadata = COALESCE(wm.metadata, '{}'::jsonb) || v_metadata,
           updated_at = now()
     WHERE wm.wa_message_id = v_wa_msg_id
     RETURNING wm.id INTO v_existing;

    IF v_existing IS NOT NULL THEN
      IF v_media_url IS NOT NULL THEN
        BEGIN
          UPDATE public.activities AS a
             SET payload = COALESCE(a.payload, '{}'::jsonb) || v_metadata
           WHERE a.kind = 'whatsapp'
             AND a.payload->>'wa_message_id' = v_wa_msg_id;
        EXCEPTION
          WHEN undefined_table THEN NULL;
          WHEN undefined_column THEN NULL;
        END;
      END IF;

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
      v_ts, v_type, v_fingerprint, v_metadata, v_owner
    )
    ON CONFLICT (wa_message_id) DO NOTHING
    RETURNING id INTO v_ins;

    IF v_ins IS NOT NULL THEN
      v_inserted := v_inserted + 1;

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
          v_metadata
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
