-- Onda 10: Notifications + Mentions
-- Idempotente: IF NOT EXISTS em tudo

-- 1. notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN (
    'mention', 'lead_replied', 'task_due_soon', 'sequence_replied',
    'deal_stage_change', 'signal_hot', 'system'
  )),
  title         text NOT NULL,
  body          text,
  link          text,
  payload       jsonb DEFAULT '{}'::jsonb,
  read_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_notif_recipient
  ON public.notifications (recipient_id, read_at, created_at DESC);

-- 2. notification_preferences
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind      text NOT NULL,
  in_app    boolean NOT NULL DEFAULT true,
  email     boolean NOT NULL DEFAULT false,
  UNIQUE (user_id, kind)
);

-- 3. RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- notifications: user reads/updates own
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'notif_owner_select') THEN
    CREATE POLICY notif_owner_select ON public.notifications FOR SELECT
      USING (auth.uid() = recipient_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'notif_owner_update') THEN
    CREATE POLICY notif_owner_update ON public.notifications FOR UPDATE
      USING (auth.uid() = recipient_id);
  END IF;
END $$;

-- allow service role / triggers to insert
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'notif_auth_insert') THEN
    CREATE POLICY notif_auth_insert ON public.notifications FOR INSERT
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- preferences: user manages own
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notification_preferences' AND policyname = 'np_owner_all') THEN
    CREATE POLICY np_owner_all ON public.notification_preferences FOR ALL
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- 4. Auto-generate notifications via trigger on activities
CREATE OR REPLACE FUNCTION public.fn_notify_on_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact RECORD;
  v_kind text;
  v_title text;
  v_link text;
  v_owner_id uuid;
BEGIN
  -- Skip if no contact
  IF NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get contact owner
  SELECT owner_id, name INTO v_contact
  FROM public.contacts
  WHERE id = NEW.contact_id
  LIMIT 1;

  v_owner_id := v_contact.owner_id;

  -- Don't notify the person who created the activity
  IF v_owner_id = NEW.created_by THEN
    RETURN NEW;
  END IF;

  -- Determine notification kind
  IF NEW.direction = 'in' AND NEW.kind IN ('whatsapp', 'email') THEN
    v_kind := 'lead_replied';
    v_title := 'Nova mensagem de ' || COALESCE(v_contact.name, 'contato');
    v_link := '/crm/contatos/' || NEW.contact_id;
  ELSIF NEW.kind = 'stage_change' THEN
    v_kind := 'deal_stage_change';
    v_title := 'Deal mudou de estágio';
    v_link := '/crm/negocios/' || COALESCE(NEW.deal_id::text, '');
  ELSIF NEW.kind = 'note' AND NEW.payload ? 'mentions' THEN
    -- Mentions handled separately below
    RETURN NEW;
  ELSE
    RETURN NEW;
  END IF;

  -- Insert notification
  INSERT INTO public.notifications (recipient_id, kind, title, body, link, payload)
  VALUES (
    v_owner_id,
    v_kind,
    v_title,
    LEFT(NEW.body, 200),
    v_link,
    jsonb_build_object('activity_id', NEW.id, 'kind', NEW.kind)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_activity ON public.activities;
CREATE TRIGGER trg_notify_on_activity
  AFTER INSERT ON public.activities
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_notify_on_activity();

-- 5. Mention notification function
CREATE OR REPLACE FUNCTION public.fn_notify_mentions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mention_id uuid;
  v_mentions uuid[];
BEGIN
  IF NEW.kind != 'note' THEN RETURN NEW; END IF;
  IF NOT (NEW.payload ? 'mentions') THEN RETURN NEW; END IF;

  -- Extract mention UUIDs from payload
  SELECT array_agg(elem::uuid)
  INTO v_mentions
  FROM jsonb_array_elements_text(NEW.payload -> 'mentions') AS elem;

  IF v_mentions IS NULL THEN RETURN NEW; END IF;

  FOREACH v_mention_id IN ARRAY v_mentions LOOP
    -- Don't notify yourself
    IF v_mention_id = NEW.created_by THEN CONTINUE; END IF;

    INSERT INTO public.notifications (recipient_id, kind, title, body, link, payload)
    VALUES (
      v_mention_id,
      'mention',
      'Você foi mencionado em uma nota',
      LEFT(NEW.body, 200),
      CASE
        WHEN NEW.contact_id IS NOT NULL
          THEN '/crm/contatos/' || NEW.contact_id
        WHEN NEW.company_id IS NOT NULL
          THEN '/crm/empresas/' || NEW.company_id
        ELSE '/hoje'
      END,
      jsonb_build_object('activity_id', NEW.id, 'mentioned_by', NEW.created_by)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_mentions ON public.activities;
CREATE TRIGGER trg_notify_mentions
  AFTER INSERT ON public.activities
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_notify_mentions();
