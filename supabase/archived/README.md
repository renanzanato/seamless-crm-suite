# Migrations arquivadas

Esta pasta guarda migrations SQL que **não devem ser rodadas** no banco. Ficam aqui só como registro histórico.

## Por que foram arquivadas

Ambas as migrations abaixo criavam tabelas `whatsapp_messages` com schemas conflitantes entre si e com o schema canônico do `RODAR_TUDO.sql`. Essa sobreposição causou os bugs em cascata (`raw_id does not exist`, `contact_id is ambiguous`, `chat_key NOT NULL`, `direction check`, etc) que enfrentamos antes da Onda 0.

## O que cada uma fazia

- **`20260419_mirror_schema.sql`**: criava `whatsapp_messages` com coluna `raw_id UNIQUE NOT NULL` (em vez de `wa_message_id`), além de tabelas `chats` e `whatsapp_outbox` que nunca foram usadas de verdade.
- **`20260419_fix_whatsapp_messages.sql`**: outra variante de `whatsapp_messages` com colunas `content`, `sender_name`, `sender_phone` e `timestamp`, sem `wa_message_id`.

## Schema canônico em uso

- `RODAR_TUDO.sql` → schema base
- `migrations/20260424_fix_whatsapp_ingest_chat_key.sql` → reconciliação final das colunas + RPC `ingest_whatsapp_chat`
- `migrations/20260424_activities_table.sql` → timeline unificada
- `migrations/20260424_contact_lifecycle_stage.sql` → lifecycle_stage em contacts

## Regra

**Não rode arquivos desta pasta.** Se precisar reconstruir o banco do zero, use apenas `RODAR_TUDO.sql` seguido das migrations em `migrations/` em ordem alfabética.
