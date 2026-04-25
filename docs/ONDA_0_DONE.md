# Onda 0 — Consolidação (concluída)

Resumo das mudanças e o que você precisa fazer pra validar.

---

## O que foi feito

### 1. Fix final da extensão WhatsApp

- RPC `ingest_whatsapp_chat` em [migrations/20260424_fix_whatsapp_ingest_chat_key.sql](../supabase/migrations/20260424_fix_whatsapp_ingest_chat_key.sql) agora preenche `chat_key`, `message_fingerprint` e `occurred_at` em `whatsapp_messages`, + `chat_key` em `whatsapp_conversations`. Isso é o que a timeline do frontend precisa.
- Também atualiza `message_count`, `last_message_at` e `last_message_preview` na conversation — o sidebar do frontend mostra esses valores.
- Backfill automático de linhas antigas (conversas + mensagens que estavam sem chat_key).

### 2. Tabela `activities` (timeline unificada)

- Nova migration [migrations/20260424_activities_table.sql](../supabase/migrations/20260424_activities_table.sql).
- Feed cronológico com `kind`: `note`, `email`, `call`, `meeting`, `whatsapp`, `task`, `sequence_step`, `stage_change`, `property_change`, `enrollment`.
- RLS: rep vê o que é dele (via ownership de contact/company/deal); admin vê tudo.
- Index único em `payload->>'wa_message_id'` pra dedup de mensagens WhatsApp.

### 3. Dual-write da RPC para activities

- Toda inserção em `whatsapp_messages` bem-sucedida agora também cria uma linha em `activities` com `kind='whatsapp'` e `payload` contendo `wa_message_id`, `wa_chat_id`, `chat_key`, `message_type`, `author`, etc.
- Protegido com `BEGIN/EXCEPTION` — se a tabela `activities` ainda não existir, silencia e continua.
- Sem backfill retroativo das mensagens já no banco (só novas). Quando a UI da Onda 1 ler de activities, mensagens antigas não aparecerão imediatamente. Decidir depois se fazemos backfill ou se só criamos as novas.

### 4. `contacts.lifecycle_stage`

- Nova migration [migrations/20260424_contact_lifecycle_stage.sql](../supabase/migrations/20260424_contact_lifecycle_stage.sql).
- Valores: `subscriber`, `lead` (default), `mql`, `sql`, `opportunity`, `customer`, `evangelist`, `disqualified`.
- Backfill baseado em estado:
  - Contato com deal em stage "Ganho/Won/Fechamento" → `customer`
  - Contato com deal em stage ativo → `opportunity`
  - Contato com interaction OU whatsapp_conversation mas sem deal → `sql`
  - Resto → `lead`

### 5. Migrations antigas arquivadas

- `supabase/migrations/20260419_mirror_schema.sql` → `supabase/archived/`
- `supabase/migrations/20260419_fix_whatsapp_messages.sql` → `supabase/archived/`
- README explicativo em [supabase/archived/README.md](../supabase/archived/README.md).
- **Não rode nada da pasta archived.** Fonte única de verdade = RODAR_TUDO.sql + migrations/.

### 6. Páginas mortas arquivadas

Movidas pra `src/_archived/pages/`:
- `VendasPage.tsx`, `MarketingPage.tsx`, `IAPage.tsx` — eram placeholders vazios sem rota.
- `MetricasPage.tsx` — redirect dummy, não usado.
- `CalendarPage.tsx` — você autorizou matar.
- `whatsapp/WhatsAppInbox.tsx` — órfão, sem rota.
- `whatsapp/DealWhatsAppTab.tsx` — órfão, sem uso.

### 7. Rotas e sidebar limpos

- [App.tsx](../src/App.tsx): removidas rotas `/calendario`, `/metricas`, `/vendas`, e o import de `CalendarPage`.
- [AppSidebar.tsx](../src/components/AppSidebar.tsx): removido item "Calendário" + ícone `CalendarDays` não usado.

### 8. HOTFIX deletado

O `supabase/HOTFIX_raw_id_error.sql` foi apagado — estava duplicando o que o migration 20260424_fix já faz de forma mais completa.

---

## O que você precisa rodar

No **Supabase SQL Editor**, na ordem:

1. **`supabase/migrations/20260424_activities_table.sql`** — cria a tabela activities. Rodar primeiro porque a próxima depende.
2. **`supabase/migrations/20260424_contact_lifecycle_stage.sql`** — adiciona coluna lifecycle_stage e faz backfill.
3. **`supabase/migrations/20260424_fix_whatsapp_ingest_chat_key.sql`** — reconciliação de schema do WhatsApp + RPC nova com dual-write para activities.

Todos são idempotentes — podem ser rodados várias vezes sem dano.

---

## Como testar

### Teste 1: extensão sincroniza WhatsApp

1. `chrome://extensions/` → reload da extensão.
2. `web.whatsapp.com` → abre um chat.
3. No CRM ([/mensagens](http://localhost:5173/mensagens)): a conversa aparece com `chat_key` preenchido e mensagens individuais visíveis.
4. `Sincronizadas` no popup da extensão sobe.

### Teste 2: activities recebeu a mensagem

No SQL Editor:
```sql
SELECT kind, body, direction, occurred_at, payload->>'wa_chat_id' AS chat_jid
  FROM public.activities
 WHERE kind = 'whatsapp'
 ORDER BY occurred_at DESC
 LIMIT 10;
```

Deve mostrar as mensagens recém-sincronizadas.

### Teste 3: lifecycle_stage preenchido

```sql
SELECT lifecycle_stage, count(*)
  FROM public.contacts
 GROUP BY lifecycle_stage;
```

Deve mostrar distribuição (não apenas NULL).

### Teste 4: CRM não quebrou

1. Abre o app (dev server: `npm run dev`).
2. Navega por: Hoje, WhatsApp, Painel, Contatos, Empresas, Pipeline.
3. Menu sidebar não mostra mais: Vendas, Marketing, IA, Calendário.
4. Nenhum erro no console.

---

## Critério de aceite da Onda 0

- [ ] Extensão sincroniza chat real e timeline no CRM mostra as mensagens individuais.
- [ ] `activities` tem pelo menos 1 linha `kind='whatsapp'` após sync.
- [ ] `contacts.lifecycle_stage` preenchido em 100% das linhas.
- [ ] Menu sidebar sem items mortos.
- [ ] `tsc --noEmit` passa.
- [ ] `node --check` passa em todos os .js da extensão.

Quando todos esses checkboxes estiverem marcados, **Onda 0 aceita** → abrimos **Onda 1 (Record Detail com timeline unificada)**.

---

## O que a Onda 1 vai mexer

- [ContactDetail.tsx](../src/pages/crm/ContactDetail.tsx) e [CompanyDetail.tsx](../src/pages/crm/CompanyDetail.tsx): timeline lendo de `activities` em vez de `whatsapp_messages`.
- Quick actions (log call, add note, create task, send whatsapp, create deal).
- Sidebar de propriedades editáveis inline.
- Criação de `DealDetail` se não existe ainda.
