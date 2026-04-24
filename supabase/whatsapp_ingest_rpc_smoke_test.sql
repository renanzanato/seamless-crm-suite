-- ================================================================
-- WhatsApp RPC Smoke Test
-- Validates public.ingest_whatsapp_chat(p_chat jsonb, p_messages jsonb)
-- with an authenticated Supabase user and rolls back at the end.
--
-- Run after:
--   1. supabase/whatsapp_crm_readonly_audit.sql
--   2. supabase/migrations/20260424_fix_whatsapp_ingest_chat_key.sql
-- ================================================================

begin;

create temp table whatsapp_rpc_smoke_ctx
on commit drop
as
with chosen_user as (
  select id, role
  from public.profiles
  where role = 'admin'
  order by created_at asc
  limit 1
),
fallback_user as (
  select id, role
  from public.profiles
  order by created_at asc
  limit 1
),
phone_seed as (
  select '99999' || lpad((floor(random() * 1000000))::int::text, 6, '0') as local_number
),
auth_user as (
  select * from chosen_user
  union all
  select * from fallback_user
  where not exists (select 1 from chosen_user)
  limit 1
)
select
  auth_user.id as user_id,
  '+55' || phone_seed.local_number as number_e164,
  '55' || phone_seed.local_number || '@c.us' as wa_chat_id,
  'wa:smoke:' || replace(gen_random_uuid()::text, '-', '') as chat_key,
  'rpc-smoke-' || replace(gen_random_uuid()::text, '-', '') as msg_one,
  'rpc-smoke-' || replace(gen_random_uuid()::text, '-', '') as msg_two
from auth_user
cross join phone_seed;

do $$
begin
  if not exists (select 1 from whatsapp_rpc_smoke_ctx) then
    raise exception 'RPC smoke test requires at least 1 public.profiles row.';
  end if;
end;
$$;

create temp table whatsapp_rpc_smoke_result (
  out_contact_id uuid,
  contact_created boolean,
  messages_inserted integer,
  messages_skipped integer
) on commit drop;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  (select user_id::text from whatsapp_rpc_smoke_ctx),
  true
);

select auth.uid() as simulated_user_id, auth.role() as simulated_role;

insert into whatsapp_rpc_smoke_result
select *
from public.ingest_whatsapp_chat(
  (
    select jsonb_build_object(
      'chat_id', wa_chat_id,
      'chat_key', chat_key,
      'number_e164', number_e164,
      'display_name', 'Smoke RPC WhatsApp',
      'push_name', 'Smoke RPC',
      'profile_pic_url', null
    )
    from whatsapp_rpc_smoke_ctx
  ),
  (
    select jsonb_build_array(
      jsonb_build_object(
        'wa_msg_id', msg_one,
        'provider_message_id', msg_one,
        'chat_id', wa_chat_id,
        'chat_key', chat_key,
        'direction', 'inbound',
        'type', 'text',
        'body', 'Smoke inbound capturado pela RPC',
        'timestamp', now()::text
      ),
      jsonb_build_object(
        'wa_msg_id', msg_two,
        'provider_message_id', msg_two,
        'chat_id', wa_chat_id,
        'chat_key', chat_key,
        'direction', 'outbound',
        'type', 'text',
        'body', 'Smoke outbound capturado pela RPC',
        'timestamp', (now() + interval '1 minute')::text
      )
    )
    from whatsapp_rpc_smoke_ctx
  )
);

select 'first_ingest' as step, *
from whatsapp_rpc_smoke_result;

do $$
declare
  v_inserted integer;
begin
  select coalesce(sum(messages_inserted), 0)
    into v_inserted
  from whatsapp_rpc_smoke_result;

  if v_inserted <> 2 then
    raise exception 'Expected 2 inserted messages, got %.', v_inserted;
  end if;
end;
$$;

truncate table whatsapp_rpc_smoke_result;

insert into whatsapp_rpc_smoke_result
select *
from public.ingest_whatsapp_chat(
  (
    select jsonb_build_object(
      'chat_id', wa_chat_id,
      'chat_key', chat_key,
      'number_e164', number_e164,
      'display_name', 'Smoke RPC WhatsApp'
    )
    from whatsapp_rpc_smoke_ctx
  ),
  (
    select jsonb_build_array(
      jsonb_build_object(
        'wa_msg_id', msg_one,
        'provider_message_id', msg_one,
        'chat_id', wa_chat_id,
        'chat_key', chat_key,
        'direction', 'inbound',
        'type', 'text',
        'body', 'Smoke inbound capturado pela RPC',
        'timestamp', now()::text
      )
    )
    from whatsapp_rpc_smoke_ctx
  )
);

select 'duplicate_ingest' as step, *
from whatsapp_rpc_smoke_result;

do $$
declare
  v_inserted integer;
  v_skipped integer;
begin
  select
    coalesce(sum(messages_inserted), 0),
    coalesce(sum(messages_skipped), 0)
    into v_inserted, v_skipped
  from whatsapp_rpc_smoke_result;

  if v_inserted <> 0 or v_skipped < 1 then
    raise exception 'Expected duplicate to be skipped, got inserted=% skipped=%.', v_inserted, v_skipped;
  end if;
end;
$$;

select
  c.id,
  c.chat_key,
  c.wa_chat_id,
  c.phone_number,
  c.message_count,
  c.last_message_at,
  c.last_message_preview
from public.whatsapp_conversations c
where c.chat_key = (select chat_key from whatsapp_rpc_smoke_ctx);

select
  m.id,
  m.chat_key,
  m.chat_id,
  m.wa_message_id,
  m.provider_message_id,
  m.direction,
  m.message_type,
  m.occurred_at,
  m.body
from public.whatsapp_messages m
where m.chat_key = (select chat_key from whatsapp_rpc_smoke_ctx)
order by m.occurred_at asc;

rollback;
