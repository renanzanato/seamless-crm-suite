# CRM Stabilization Runbook

Este runbook organiza o plano de estabilizacao do CRM em ordem operacional. A prioridade e deixar o CRM utilizavel agora, com WhatsApp espelhando no Supabase e aparecendo em `/mensagens`.

## P0 - Bugs bloqueantes

- WhatsApp deve gravar conversas e mensagens pelo contrato canonico `chat_key`.
- Supabase de producao deve ter a RPC `public.ingest_whatsapp_chat(p_chat jsonb, p_messages jsonb)` atualizada.
- `/mensagens` deve ler `whatsapp_conversations` e `whatsapp_messages` por `chat_key`.
- A extensao deve preencher `last_error` quando o contato nao esta aprovado, quando a RPC falha ou quando o backfill falha.
- `npm run lint` e `npm run build` precisam passar antes de publicar.

## P1 - Bugs funcionais

- Validar os fluxos de CRM: login, contatos, empresas, negocios, dashboard, integracoes e sequencias.
- Tratar `src/services/whatsappSync.ts`, `WhatsAppInbox` e componentes em `src/components/whatsapp` como legado do mirror v1 ate serem migrados para o contrato canonico.
- Revisar RLS/policies no Supabase quando a auditoria apontar policies com `USING (true)` ou `WITH CHECK (true)`.
- Manter scripts destrutivos fora do deploy normal, especialmente wipes e hotfixes manuais.

## P2 - Melhorias

- Melhorar estados de erro e vazio nas telas operacionais.
- Adicionar smoke tests recorrentes para o contrato do Supabase.
- Criar um checklist de saude antes de cada deploy.
- Consolidar documentacao para reduzir a dependencia de SQL duplicado.

## P3 - Arquitetura

- Migrar gradualmente para o modelo de canais descrito em `CHANNEL_INTEGRATIONS_ARCHITECTURE.md`.
- Manter o WhatsApp atual como fluxo operacional ate a base estar estavel.
- Nao introduzir `channel_threads` e `channel_messages` no caminho critico do fix atual.

## Ordem segura para producao

1. Rodar `supabase/whatsapp_crm_readonly_audit.sql` no SQL Editor.
2. Salvar o resultado da auditoria e confirmar se a migration de `20260424` falta.
3. Fazer backup/snapshot do projeto Supabase.
4. Rodar `supabase/migrations/20260424_fix_whatsapp_ingest_chat_key.sql`.
5. Rodar `supabase/whatsapp_ingest_rpc_smoke_test.sql`.
6. Recarregar a extensao no Chrome.
7. Fazer login na extensao.
8. Abrir um contato aprovado no WhatsApp Web.
9. Usar backfill manual pela extensao.
10. Abrir `/mensagens` e confirmar que a conversa mostra mensagens individuais.

## Checklist de aceite

- A auditoria nao mostra colunas obrigatorias ausentes.
- A RPC `ingest_whatsapp_chat` aparece com argumentos `p_chat jsonb, p_messages jsonb`.
- O smoke test da RPC insere 2 mensagens e pula duplicata no rollback.
- A extensao mostra `last_status = message_synced` ou `backfill_no_new`, sem `last_error`.
- `/mensagens` mostra `chat_key`, `ID WhatsApp` e as mensagens da conversa.
- Contato nao aprovado aparece como erro operacional na extensao, nao como sucesso falso.
- `npm run lint` passa sem erro.
- `npm run build` passa.

## Observacoes

- `supabase/HOTFIX_raw_id_error.sql` e `supabase/whatsapp_wipe.sql` sao scripts manuais e nao fazem parte do deploy padrao.
- Se `npm run test` falhar com `spawn EPERM` no Windows, valide se o antivirus/permissao do OneDrive esta bloqueando o binario do esbuild usado pelo Vitest. O build e o lint continuam sendo os gates minimos ate o ambiente de teste ser corrigido.
