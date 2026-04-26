-- Onda 9: Email Integration (OAuth + Tracking)
-- Idempotente: IF NOT EXISTS em tudo

-- 1. email_accounts: OAuth tokens por user
CREATE TABLE IF NOT EXISTS public.email_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider        text NOT NULL CHECK (provider IN ('gmail', 'outlook')),
  email_address   text NOT NULL,
  access_token    text NOT NULL,
  refresh_token   text NOT NULL,
  expires_at      timestamptz NOT NULL,
  scopes          text[] DEFAULT '{}',
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','revoked')),
  connected_at    timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_accounts_owner
  ON public.email_accounts (owner_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_accounts_email
  ON public.email_accounts (email_address);

-- 2. email_tracking: sent/open/click/reply tracking
CREATE TABLE IF NOT EXISTS public.email_tracking (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      text,
  thread_id       text,
  account_id      uuid REFERENCES public.email_accounts(id) ON DELETE SET NULL,
  contact_id      uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  direction       text NOT NULL DEFAULT 'out' CHECK (direction IN ('in','out')),
  subject         text,
  body_preview    text,
  sent_at         timestamptz DEFAULT now(),
  opened_at       timestamptz,
  clicked_at      timestamptz,
  replied_at      timestamptz,
  error_msg       text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_tracking_contact
  ON public.email_tracking (contact_id);
CREATE INDEX IF NOT EXISTS idx_email_tracking_message
  ON public.email_tracking (message_id);

-- 3. RLS
ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_tracking ENABLE ROW LEVEL SECURITY;

-- email_accounts: owner sees own
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_accounts' AND policyname = 'ea_owner_select') THEN
    CREATE POLICY ea_owner_select ON public.email_accounts FOR SELECT
      USING (auth.uid() = owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_accounts' AND policyname = 'ea_owner_insert') THEN
    CREATE POLICY ea_owner_insert ON public.email_accounts FOR INSERT
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_accounts' AND policyname = 'ea_owner_update') THEN
    CREATE POLICY ea_owner_update ON public.email_accounts FOR UPDATE
      USING (auth.uid() = owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_accounts' AND policyname = 'ea_owner_delete') THEN
    CREATE POLICY ea_owner_delete ON public.email_accounts FOR DELETE
      USING (auth.uid() = owner_id);
  END IF;
END $$;

-- email_tracking: authenticated read all (team visibility)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_tracking' AND policyname = 'et_auth_select') THEN
    CREATE POLICY et_auth_select ON public.email_tracking FOR SELECT
      USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_tracking' AND policyname = 'et_auth_insert') THEN
    CREATE POLICY et_auth_insert ON public.email_tracking FOR INSERT
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_tracking' AND policyname = 'et_auth_update') THEN
    CREATE POLICY et_auth_update ON public.email_tracking FOR UPDATE
      USING (auth.uid() IS NOT NULL);
  END IF;
END $$;
