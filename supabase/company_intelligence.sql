-- ═══════════════════════════════════════════════════════
-- PIPA-008 — Company Intelligence (mercado imobiliário)
-- Rodar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════

-- ── Novos campos na tabela companies ────────────────────
alter table public.companies
  add column if not exists status text default 'new'
    check (status in ('new', 'prospecting', 'contacted', 'meeting_booked', 'proposal', 'customer', 'lost')),
  add column if not exists score_tier text default 'C'
    check (score_tier in ('A', 'B', 'C')),
  add column if not exists sales_model text
    check (sales_model in ('internal', 'external', 'hybrid')),
  add column if not exists has_active_launch boolean default false,
  add column if not exists upcoming_launch boolean default false,
  add column if not exists launch_count_year integer default 0,
  add column if not exists vgv_projected numeric,
  add column if not exists monthly_media_spend numeric,
  add column if not exists instagram_url text,
  add column if not exists connection_count integer default 0;

-- ── Tabela de lançamentos por incorporadora ──────────────
create table if not exists public.company_launches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  status text not null default 'active'
    check (status in ('active', 'upcoming', 'sold_out', 'cancelled')),
  launch_date date,
  delivery_date date,
  units_total integer,
  units_sold integer default 0,
  vgv numeric,
  price_per_sqm numeric,
  address text,
  city text,
  neighborhood text,
  website_url text,
  landing_page_url text,
  instagram_url text,
  notes text,
  created_at timestamptz default now()
);

create index if not exists idx_launches_company on company_launches(company_id);

alter table public.company_launches enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='company_launches' and policyname='auth_all') then
    create policy "auth_all" on company_launches for all to authenticated using (true) with check (true);
  end if;
end $$;

-- ── View: estatísticas de contas (TAM) ──────────────────
create or replace view public.account_stats as
select
  count(*) as total_accounts,
  count(*) filter (where connection_count > 0) as with_connections,
  count(*) filter (where buying_signal = 'hot') as burning_accounts,
  count(*) filter (where has_active_launch = true) as with_active_launch,
  count(*) filter (where upcoming_launch = true) as with_upcoming_launch,
  count(*) filter (where sales_model = 'hybrid') as hybrid_sales,
  count(*) filter (where cadence_status = 'active') as in_cadence
from public.companies;

-- ── Atualizar função de score pra incluir tier ───────────
create or replace function public.recalculate_buying_signal(p_company_id uuid)
returns void language plpgsql as $$
declare
  v_signal_count integer;
  v_has_active_launch boolean;
  v_has_slow_response boolean;
  v_has_no_followup boolean;
  v_is_hiring boolean;
  v_score integer := 0;
  v_signal text;
  v_tier text;
begin
  select count(*) into v_signal_count
  from account_signals where company_id = p_company_id;

  select
    exists(select 1 from account_signals where company_id = p_company_id and signal_type = 'slow_response'),
    exists(select 1 from account_signals where company_id = p_company_id and signal_type = 'no_followup'),
    exists(select 1 from account_signals where company_id = p_company_id and signal_type in ('hiring_sales','hiring_marketing'))
  into v_has_slow_response, v_has_no_followup, v_is_hiring;

  select coalesce(has_active_launch, false) into v_has_active_launch
  from companies where id = p_company_id;

  v_score := least(100, v_signal_count * 15);
  if v_has_active_launch   then v_score := v_score + 25; end if;
  if v_has_slow_response   then v_score := v_score + 15; end if;
  if v_has_no_followup     then v_score := v_score + 15; end if;
  if v_is_hiring           then v_score := v_score + 10; end if;

  if v_score >= 60 then v_signal := 'hot';  v_tier := 'A';
  elsif v_score >= 30 then v_signal := 'warm'; v_tier := 'B';
  else v_signal := 'cold'; v_tier := 'C';
  end if;

  update public.companies
  set icp_score = v_score, buying_signal = v_signal, score_tier = v_tier
  where id = p_company_id;
end;
$$;
