-- ============================================================
-- Pipa Driven — LIMPA GERAL de dados capturados do WhatsApp
--
-- Apaga dados pessoais capturados pela extensão:
--   - activities kind='whatsapp' (timeline atual do CRM)
--   - whatsapp_messages
--   - whatsapp_conversations
--   - jobs/filas legadas ligadas ao WhatsApp, se existirem
--   - contatos orphan criados automaticamente pela extensão
--   - inventário de objetos nos buckets whatsapp-media / whatsapp-audio
--
-- Preserva contatos "reais" fora da captura:
--   - só remove contacts com source='whatsapp_capture' e is_orphan=true
--
-- Rodar no Supabase SQL Editor, em um único bloco.
-- Reversível SOMENTE via backup.
-- ============================================================

begin;

-- 0) Inventário pré-limpa
select
  (select count(*) from public.activities where kind = 'whatsapp') as activities_whatsapp,
  (select count(*) from public.whatsapp_messages) as whatsapp_messages,
  (select count(*) from public.whatsapp_conversations) as whatsapp_conversations,
  (select count(*) from public.contacts where is_orphan = true and source = 'whatsapp_capture') as orphan_contacts,
  (select count(*) from storage.objects where bucket_id in ('whatsapp-media', 'whatsapp-audio')) as storage_objects;

-- 1) Timeline unificada: é daqui que as telas novas leem WhatsApp.
delete from public.activities
 where kind = 'whatsapp';

-- 2) Mensagens capturadas no canal específico.
do $$
begin
  if to_regclass('public.whatsapp_messages') is not null then
    execute 'truncate table public.whatsapp_messages restart identity cascade';
  end if;
end $$;

-- 3) Rollups/conversas capturadas.
do $$
begin
  if to_regclass('public.whatsapp_conversations') is not null then
    execute 'truncate table public.whatsapp_conversations restart identity cascade';
  end if;
end $$;

-- 4) Jobs de transcrição de áudio, se existirem.
do $$
begin
  if to_regclass('public.transcription_jobs') is not null then
    execute 'truncate table public.transcription_jobs restart identity cascade';
  end if;
end $$;

-- 5) Outbox CRM -> WhatsApp legado, se existir.
do $$
begin
  if to_regclass('public.whatsapp_outbox') is not null then
    execute 'truncate table public.whatsapp_outbox restart identity cascade';
  end if;
end $$;

-- 6) Fila de auto-reply, se existir.
do $$
begin
  if to_regclass('public.auto_reply_queue') is not null then
    execute 'truncate table public.auto_reply_queue restart identity cascade';
  end if;
end $$;

-- 7) Tabela chats legada, se existir.
do $$
begin
  if to_regclass('public.chats') is not null then
    execute 'truncate table public.chats restart identity cascade';
  end if;
end $$;

-- 8) Contatos criados pela extensão como orphan.
--    Só apaga se ainda for orphan; contato convertido para real fica preservado.
delete from public.contacts
 where is_orphan = true
   and source = 'whatsapp_capture';

-- 8.1) OPCIONAL MAIS RADICAL — deixe comentado se quiser preservar CRM real.
--      Use somente se os contatos de teste foram convertidos para "reais"
--      ou se voce quer remover telefone/WhatsApp de TODOS os contatos.
--
-- Apagar todos os contatos criados pela captura, mesmo se deixaram de ser orphan:
-- delete from public.contacts
--  where source = 'whatsapp_capture';
--
-- Zerar telefone/WhatsApp em todos os contatos restantes:
-- update public.contacts
--    set whatsapp = null,
--        phone = null
--  where whatsapp is not null
--     or phone is not null;

-- 9) Storage: SQL não pode apagar storage.objects diretamente.
--    O Supabase bloqueia DELETE direto nessa tabela para evitar objetos órfãos.
--    Apague os arquivos pelo painel/API:
--    Supabase Dashboard -> Storage -> whatsapp-media -> selecionar tudo -> delete.
--    Repita para whatsapp-audio se esse bucket antigo existir.
select
  bucket_id,
  count(*) as objetos_para_apagar_no_storage
from storage.objects
where bucket_id in ('whatsapp-media', 'whatsapp-audio')
group by bucket_id
order by bucket_id;

-- 10) Checks de sanidade pós-limpa
select
  (select count(*) from public.activities where kind = 'whatsapp') as activities_whatsapp_restantes,
  (select count(*) from public.whatsapp_messages) as messages_restantes,
  (select count(*) from public.whatsapp_conversations) as conversations_restantes,
  (select count(*) from public.contacts where is_orphan = true and source = 'whatsapp_capture') as orphan_contacts_restantes,
  (select count(*) from storage.objects where bucket_id in ('whatsapp-media', 'whatsapp-audio')) as storage_objects_para_apagar_via_painel;

commit;
