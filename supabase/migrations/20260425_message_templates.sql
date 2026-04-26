-- ============================================================
-- Pipa Driven — Onda 7: message templates
--
-- Per-user templates for WhatsApp, email and LinkedIn.
-- ============================================================

begin;

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  name text not null,
  channel text not null check (channel in ('whatsapp', 'email', 'linkedin')),
  body text not null,
  variables jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists message_templates_owner_idx
  on public.message_templates (owner_id, created_at desc);

create index if not exists message_templates_channel_idx
  on public.message_templates (channel);

alter table public.message_templates enable row level security;

drop policy if exists "message_templates_select_owner_or_admin" on public.message_templates;
create policy "message_templates_select_owner_or_admin"
  on public.message_templates
  for select
  to authenticated
  using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "message_templates_insert_owner" on public.message_templates;
create policy "message_templates_insert_owner"
  on public.message_templates
  for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "message_templates_update_owner_or_admin" on public.message_templates;
create policy "message_templates_update_owner_or_admin"
  on public.message_templates
  for update
  to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "message_templates_delete_owner_or_admin" on public.message_templates;
create policy "message_templates_delete_owner_or_admin"
  on public.message_templates
  for delete
  to authenticated
  using (owner_id = auth.uid() or public.is_admin());

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_message_templates_touch_updated_at on public.message_templates;
create trigger trg_message_templates_touch_updated_at
  before update on public.message_templates
  for each row
  execute function public.touch_updated_at();

commit;
