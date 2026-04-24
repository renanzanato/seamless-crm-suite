-- ================================================================
-- WhatsApp CRM Mirror - Production Audit (safe inventory)
-- Run in Supabase SQL Editor before applying any fix.
--
-- This script writes only to a TEMP table inside a transaction and
-- rolls back at the end. It does not change public/storage data.
-- ================================================================

begin;

create temp table crm_audit_results (
  id bigserial primary key,
  section text not null,
  check_name text not null,
  status text not null,
  detail text,
  row_count bigint
) on commit drop;

insert into crm_audit_results(section, check_name, status, detail, row_count)
values
  ('session', 'database', 'info', current_database(), null),
  ('session', 'user', 'info', current_user, null),
  ('session', 'timestamp', 'info', now()::text, null);

with expected(table_name) as (
  values
    ('profiles'),
    ('companies'),
    ('contacts'),
    ('whatsapp_conversations'),
    ('whatsapp_messages'),
    ('whatsapp_message_media'),
    ('transcription_jobs')
),
missing as (
  select table_name
  from expected
  where to_regclass('public.' || table_name) is null
)
insert into crm_audit_results(section, check_name, status, detail, row_count)
select
  'schema',
  'required_tables',
  case when count(*) = 0 then 'ok' else 'missing' end,
  coalesce(string_agg(table_name, ', ' order by table_name), 'none'),
  count(*)
from missing;

with expected(table_name, column_name) as (
  values
    ('whatsapp_conversations', 'id'),
    ('whatsapp_conversations', 'chat_key'),
    ('whatsapp_conversations', 'wa_chat_id'),
    ('whatsapp_conversations', 'phone_number'),
    ('whatsapp_conversations', 'contact_id'),
    ('whatsapp_conversations', 'company_id'),
    ('whatsapp_conversations', 'source'),
    ('whatsapp_conversations', 'message_count'),
    ('whatsapp_conversations', 'last_message_at'),
    ('whatsapp_conversations', 'last_message_preview'),
    ('whatsapp_conversations', 'ingestion_status'),
    ('whatsapp_conversations', 'ingestion_error'),
    ('whatsapp_messages', 'id'),
    ('whatsapp_messages', 'conversation_id'),
    ('whatsapp_messages', 'chat_key'),
    ('whatsapp_messages', 'chat_id'),
    ('whatsapp_messages', 'wa_message_id'),
    ('whatsapp_messages', 'provider_message_id'),
    ('whatsapp_messages', 'message_fingerprint'),
    ('whatsapp_messages', 'direction'),
    ('whatsapp_messages', 'message_type'),
    ('whatsapp_messages', 'body'),
    ('whatsapp_messages', 'occurred_at'),
    ('whatsapp_messages', 'sent_at'),
    ('whatsapp_messages', 'metadata'),
    ('whatsapp_messages', 'ingestion_status'),
    ('whatsapp_messages', 'ingestion_error')
),
missing as (
  select e.table_name, e.column_name
  from expected e
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = e.table_name
   and c.column_name = e.column_name
  where c.column_name is null
)
insert into crm_audit_results(section, check_name, status, detail, row_count)
select
  'schema',
  'required_whatsapp_columns',
  case when count(*) = 0 then 'ok' else 'missing' end,
  coalesce(string_agg(table_name || '.' || column_name, ', ' order by table_name, column_name), 'none'),
  count(*)
from missing;

insert into crm_audit_results(section, check_name, status, detail, row_count)
select
  'rpc',
  'ingest_whatsapp_chat_jsonb_jsonb',
  case when count(*) > 0 then 'ok' else 'missing' end,
  coalesce(
    string_agg(
      p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') returns ' || pg_get_function_result(p.oid),
      ' | '
      order by p.oid
    ),
    'none'
  ),
  count(*)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'ingest_whatsapp_chat'
  and pg_get_function_identity_arguments(p.oid) = 'p_chat jsonb, p_messages jsonb';

with target(table_name) as (
  values
    ('contacts'),
    ('whatsapp_conversations'),
    ('whatsapp_messages'),
    ('whatsapp_message_media'),
    ('transcription_jobs')
),
rls as (
  select
    t.table_name,
    c.relrowsecurity,
    c.relforcerowsecurity
  from target t
  left join pg_class c on c.oid = to_regclass('public.' || t.table_name)
)
insert into crm_audit_results(section, check_name, status, detail, row_count)
select
  'security',
  'rls_enabled',
  case
    when count(*) filter (where relrowsecurity is true) = count(*) then 'ok'
    else 'review'
  end,
  string_agg(table_name || '=' || coalesce(relrowsecurity::text, 'missing'), ', ' order by table_name),
  count(*) filter (where relrowsecurity is not true)
from rls;

insert into crm_audit_results(section, check_name, status, detail, row_count)
select
  'security',
  'permissive_true_policies',
  case when count(*) = 0 then 'ok' else 'review' end,
  coalesce(
    string_agg(
      schemaname || '.' || tablename || ':' || policyname || ' cmd=' || cmd,
      ' | '
      order by schemaname, tablename, policyname
    ),
    'none'
  ),
  count(*)
from pg_policies
where schemaname in ('public', 'storage')
  and (
    coalesce(qual, '') in ('true', '(true)')
    or coalesce(with_check, '') in ('true', '(true)')
  );

insert into crm_audit_results(section, check_name, status, detail, row_count)
select
  'indexes',
  'whatsapp_indexes',
  'info',
  coalesce(string_agg(tablename || ':' || indexname, ' | ' order by tablename, indexname), 'none'),
  count(*)
from pg_indexes
where schemaname = 'public'
  and tablename in ('whatsapp_conversations', 'whatsapp_messages', 'whatsapp_message_media', 'transcription_jobs');

do $audit$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    begin
      execute $q$
        insert into crm_audit_results(section, check_name, status, detail, row_count)
        select
          'migrations',
          'schema_migrations_20260424',
          case when count(*) > 0 then 'ok' else 'missing' end,
          coalesce(string_agg(version, ', ' order by version), 'none'),
          count(*)
        from supabase_migrations.schema_migrations
        where version like '20260424%'
      $q$;
    exception when others then
      insert into crm_audit_results(section, check_name, status, detail)
      values ('migrations', 'schema_migrations_20260424', 'error', sqlerrm);
    end;
  else
    insert into crm_audit_results(section, check_name, status, detail)
    values ('migrations', 'schema_migrations_20260424', 'unknown', 'supabase_migrations.schema_migrations not found');
  end if;

  if to_regclass('public.whatsapp_conversations') is not null then
    begin
      execute $q$
        insert into crm_audit_results(section, check_name, status, detail, row_count)
        select 'data', 'whatsapp_conversations_total', 'info', null, count(*)
        from public.whatsapp_conversations
      $q$;
    exception when others then
      insert into crm_audit_results(section, check_name, status, detail)
      values ('data', 'whatsapp_conversations_total', 'error', sqlerrm);
    end;

    begin
      execute $q$
        insert into crm_audit_results(section, check_name, status, detail, row_count)
        select
          'data',
          'conversations_missing_chat_key',
          case when count(*) = 0 then 'ok' else 'fail' end,
          null,
          count(*)
        from public.whatsapp_conversations
        where chat_key is null or btrim(chat_key) = ''
      $q$;
    exception when others then
      insert into crm_audit_results(section, check_name, status, detail)
      values ('data', 'conversations_missing_chat_key', 'error', sqlerrm);
    end;

    begin
      execute $q$
        insert into crm_audit_results(section, check_name, status, detail, row_count)
        select
          'data',
          'duplicate_conversation_chat_key',
          case when count(*) = 0 then 'ok' else 'fail' end,
          coalesce(string_agg(chat_key || ' x' || dup_count, ' | ' order by dup_count desc, chat_key), 'none'),
          count(*)
        from (
          select chat_key, count(*) as dup_count
          from public.whatsapp_conversations
          where chat_key is not null and btrim(chat_key) <> ''
          group by chat_key
          having count(*) > 1
        ) d
      $q$;
    exception when others then
      insert into crm_audit_results(section, check_name, status, detail)
      values ('data', 'duplicate_conversation_chat_key', 'error', sqlerrm);
    end;
  end if;

  if to_regclass('public.whatsapp_messages') is not null then
    begin
      execute $q$
        insert into crm_audit_results(section, check_name, status, detail, row_count)
        select 'data', 'whatsapp_messages_total', 'info', null, count(*)
        from public.whatsapp_messages
      $q$;
    exception when others then
      insert into crm_audit_results(section, check_name, status, detail)
      values ('data', 'whatsapp_messages_total', 'error', sqlerrm);
    end;

    begin
      execute $q$
        insert into crm_audit_results(section, check_name, status, detail, row_count)
        select
          'data',
          'messages_missing_chat_key',
          case when count(*) = 0 then 'ok' else 'fail' end,
          null,
          count(*)
        from public.whatsapp_messages
        where chat_key is null or btrim(chat_key) = ''
      $q$;
    exception when others then
      insert into crm_audit_results(section, check_name, status, detail)
      values ('data', 'messages_missing_chat_key', 'error', sqlerrm);
    end;

    begin
      execute $q$
        insert into crm_audit_results(section, check_name, status, detail, row_count)
        select
          'data',
          'messages_without_conversation_by_chat_key',
          case when count(*) = 0 then 'ok' else 'fail' end,
          null,
          count(*)
        from public.whatsapp_messages m
        left join public.whatsapp_conversations c on c.chat_key = m.chat_key
        where m.chat_key is not null
          and btrim(m.chat_key) <> ''
          and c.id is null
      $q$;
    exception when others then
      insert into crm_audit_results(section, check_name, status, detail)
      values ('data', 'messages_without_conversation_by_chat_key', 'error', sqlerrm);
    end;

    begin
      execute $q$
        insert into crm_audit_results(section, check_name, status, detail, row_count)
        select
          'data',
          'duplicate_messages_provider_id',
          case when count(*) = 0 then 'ok' else 'fail' end,
          coalesce(string_agg(chat_key || ':' || provider_message_id || ' x' || dup_count, ' | ' order by dup_count desc), 'none'),
          count(*)
        from (
          select chat_key, provider_message_id, count(*) as dup_count
          from public.whatsapp_messages
          where chat_key is not null
            and btrim(chat_key) <> ''
            and provider_message_id is not null
            and btrim(provider_message_id) <> ''
          group by chat_key, provider_message_id
          having count(*) > 1
        ) d
      $q$;
    exception when others then
      insert into crm_audit_results(section, check_name, status, detail)
      values ('data', 'duplicate_messages_provider_id', 'error', sqlerrm);
    end;
  end if;

  if to_regclass('public.whatsapp_conversations') is not null
     and to_regclass('public.whatsapp_messages') is not null then
    begin
      execute $q$
        insert into crm_audit_results(section, check_name, status, detail, row_count)
        select
          'data',
          'conversation_message_count_mismatch',
          case when count(*) = 0 then 'ok' else 'review' end,
          coalesce(string_agg(chat_key || ' saved=' || saved_count || ' actual=' || actual_count, ' | ' order by chat_key), 'none'),
          count(*)
        from (
          select
            c.chat_key,
            coalesce(c.message_count, 0) as saved_count,
            count(m.id) as actual_count
          from public.whatsapp_conversations c
          left join public.whatsapp_messages m on m.chat_key = c.chat_key
          where c.chat_key is not null and btrim(c.chat_key) <> ''
          group by c.id, c.chat_key, c.message_count
          having coalesce(c.message_count, 0) <> count(m.id)
        ) mismatch
      $q$;
    exception when others then
      insert into crm_audit_results(section, check_name, status, detail)
      values ('data', 'conversation_message_count_mismatch', 'error', sqlerrm);
    end;
  end if;

  if to_regclass('public.chats') is not null then
    begin
      execute $q$
        insert into crm_audit_results(section, check_name, status, detail, row_count)
        select
          'legacy',
          'legacy_chats_table_rows',
          case when count(*) = 0 then 'ok' else 'review' end,
          'public.chats exists; canonical UI should use whatsapp_conversations',
          count(*)
        from public.chats
      $q$;
    exception when others then
      insert into crm_audit_results(section, check_name, status, detail)
      values ('legacy', 'legacy_chats_table_rows', 'error', sqlerrm);
    end;
  else
    insert into crm_audit_results(section, check_name, status, detail, row_count)
    values ('legacy', 'legacy_chats_table_rows', 'ok', 'public.chats not found', 0);
  end if;

  if to_regclass('public.monitored_chats') is not null then
    begin
      execute $q$
        insert into crm_audit_results(section, check_name, status, detail, row_count)
        select
          'legacy',
          'legacy_monitored_chats_rows',
          case when count(*) = 0 then 'ok' else 'review' end,
          'public.monitored_chats exists; review before deleting',
          count(*)
        from public.monitored_chats
      $q$;
    exception when others then
      insert into crm_audit_results(section, check_name, status, detail)
      values ('legacy', 'legacy_monitored_chats_rows', 'error', sqlerrm);
    end;
  else
    insert into crm_audit_results(section, check_name, status, detail, row_count)
    values ('legacy', 'legacy_monitored_chats_rows', 'ok', 'public.monitored_chats not found', 0);
  end if;
end;
$audit$;

select section, check_name, status, detail, row_count
from crm_audit_results
order by id;

rollback;
