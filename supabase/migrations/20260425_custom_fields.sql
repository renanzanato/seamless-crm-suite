-- ============================================================
-- Pipa Driven — Onda 7: custom fields + settings support
--
-- Idempotent support for no-code Settings:
--   - expands profiles metadata used by user management
--   - adds custom_data JSONB to core CRM records
--   - adds optional stage color for pipeline settings
--   - creates custom_fields with RLS
-- ============================================================

begin;

-- 1) Profiles support for no-code user management.
alter table public.profiles
  add column if not exists email text,
  add column if not exists team_id uuid,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

update public.profiles p
   set email = u.email
  from auth.users u
 where p.id = u.id
   and p.email is null;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
      from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint if exists %I', constraint_name);
  end loop;
end $$;

update public.profiles
   set role = 'rep'
 where role = 'sales';

update public.profiles
   set role = 'viewer'
 where role not in ('admin', 'manager', 'rep', 'viewer', 'user');

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'manager', 'rep', 'viewer', 'user'));

create index if not exists profiles_email_idx on public.profiles (lower(email));
create index if not exists profiles_active_idx on public.profiles (is_active);

drop policy if exists "profiles: admin inserts pending users" on public.profiles;
create policy "profiles: admin inserts pending users"
  on public.profiles
  for insert
  to authenticated
  with check (public.is_admin());

-- 2) JSONB storage for custom field values.
alter table public.contacts
  add column if not exists custom_data jsonb not null default '{}'::jsonb;

alter table public.companies
  add column if not exists custom_data jsonb not null default '{}'::jsonb;

alter table public.deals
  add column if not exists custom_data jsonb not null default '{}'::jsonb;

-- 3) Stage colors for pipeline settings.
alter table public.stages
  add column if not exists color text;

-- 4) Custom field definitions.
create table if not exists public.custom_fields (
  id uuid primary key default gen_random_uuid(),
  entity text not null check (entity in ('contacts', 'companies', 'deals')),
  field_name text not null,
  field_type text not null check (field_type in ('text', 'number', 'date', 'enum', 'boolean')),
  options jsonb not null default '[]'::jsonb,
  is_required boolean not null default false,
  "order" integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists custom_fields_entity_name_unique
  on public.custom_fields (entity, lower(field_name));

create index if not exists custom_fields_entity_order_idx
  on public.custom_fields (entity, "order");

alter table public.custom_fields enable row level security;

drop policy if exists "custom_fields_select_authenticated" on public.custom_fields;
create policy "custom_fields_select_authenticated"
  on public.custom_fields
  for select
  to authenticated
  using (auth.uid() is not null);

drop policy if exists "custom_fields_insert_admin" on public.custom_fields;
create policy "custom_fields_insert_admin"
  on public.custom_fields
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "custom_fields_update_admin" on public.custom_fields;
create policy "custom_fields_update_admin"
  on public.custom_fields
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "custom_fields_delete_admin" on public.custom_fields;
create policy "custom_fields_delete_admin"
  on public.custom_fields
  for delete
  to authenticated
  using (public.is_admin());

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_custom_fields_touch_updated_at on public.custom_fields;
create trigger trg_custom_fields_touch_updated_at
  before update on public.custom_fields
  for each row
  execute function public.touch_updated_at();

drop trigger if exists trg_profiles_touch_updated_at on public.profiles;
create trigger trg_profiles_touch_updated_at
  before update on public.profiles
  for each row
  execute function public.touch_updated_at();

commit;
