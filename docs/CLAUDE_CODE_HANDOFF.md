# Pipa Driven — Prompts pra outras instâncias do Claude Code

> Cada bloco abaixo é um prompt **auto-suficiente** que pode ser colado direto numa sessão nova do Claude Code (Antigravity ou outra). Inclui contexto, spec, critério de aceite e regras de engajamento.

---

## Como usar

1. **Não rode duas instâncias na mesma phase ao mesmo tempo.** Se você (Renan) já delegou Phase 1G pra alguém, espera fechar antes de abrir Phase 2.
2. Copia o bloco da phase desejada (do `### PROMPT — ...` até o próximo `---`).
3. Cola na instância nova. Ela tem que abrir o repo `seamless-crm-suite/` antes.
4. Quando ela terminar, ela cria um `docs/PHASE_X_DONE.md` (ou `ONDA_X_DONE.md`) e atualiza o `docs/CRM_ROADMAP.md`.
5. Você revisa antes de aprovar próxima phase.

---

## Contexto comum (incluído em todo prompt)

Este projeto é um CRM B2B feito em React + TypeScript + Supabase (`seamless-crm-suite/`). O modelo canônico é:

- **Companies** (organização) + **Contacts** (pessoa) + **Deals** (oportunidade) + **Activities** (timeline unificada).
- "Lead" não é tabela — é `contacts.lifecycle_stage = 'lead'`.
- Toda interação (note, call, whatsapp, email, meeting, task, sequence_step, stage_change, property_change, enrollment) entra em `public.activities`.
- Frontend lê via `<ActivityTimeline contactId|companyId|dealId>` que está em `src/components/activities/ActivityTimeline.tsx`.
- Service de activities em `src/services/activitiesService.ts` já tem helpers: `createNoteActivity`, `createCallActivity`, `createTaskActivity`, `createMeetingActivity`, `createStageChangeActivity`, `createPropertyChangeActivity`, `updateRecordField`, `setTaskStatus`.

**Leitura obrigatória antes de codar**:
- `docs/CRM_ROADMAP.md` — visão geral
- `docs/CODEX_HANDOFF.md` — regras detalhadas (especialmente §6 Regras de engajamento)
- `docs/ONDA_0_DONE.md`, `docs/PHASE_1A_2_DONE.md`, `docs/PHASE_1B_DONE.md`, `docs/PHASE_1C_DONE.md`, `docs/PHASE_1D_DONE.md`, `docs/PHASE_1F_DONE.md` — o que já foi feito

**Regras de engajamento (resumo)**:
- TSC `npx tsc --noEmit` deve passar antes de fechar.
- `node --check` em todos os JS da extensão (se mexer) deve passar.
- Migrations devem ser idempotentes (`CREATE ... IF NOT EXISTS`, `DO $$ EXCEPTION WHEN ...`).
- Nunca DROP table/column sem autorização. Nunca bypassa hooks (`--no-verify`).
- Nunca delete arquivo — move pra `_archived/` ou `archived/`.
- Sempre cria um `docs/PHASE_X_DONE.md` ao fechar e atualiza `CRM_ROADMAP.md`.
- RLS em toda tabela nova. Policy default: `auth.uid() IS NOT NULL` pra INSERT, ownership-based pra SELECT.

---

### PROMPT — Phase 1G (Property inline edit)

```
Você é um agente engenheiro pegando a Phase 1G do CRM Pipa Driven (`seamless-crm-suite/`). Leia primeiro `docs/CRM_ROADMAP.md` e `docs/CODEX_HANDOFF.md` §6 antes de mexer em nada.

Estado atual: Phase 1F entregue. Sidebar direita das pages Detail (Contact/Company/Deal) hoje é READ-ONLY. Sua missão é torná-la EDITÁVEL inline, com geração automática de `activity kind='property_change'` pra audit trail.

ESCOPO

1. Criar componente reutilizável em `src/components/inline/InlineEdit.tsx` com props:
   - `value: string | number | null`
   - `onSave: (newValue: string | number | null) => Promise<void>`
   - `type: 'text' | 'textarea' | 'date' | 'currency' | 'select'`
   - `options?: Array<{ value: string; label: string }>` (obrigatório se type='select')
   - `placeholder?: string`
   - `format?: (v) => string` (formatter pro display read mode)
   - `validate?: (v) => string | null` (retorna erro)
   - `disabled?: boolean`

   Comportamento:
   - Read mode: mostra valor formatado (ou placeholder cinza se null) + ícone de pencil pequeno aparece em hover.
   - Click → entra em edit mode com input/select/textarea apropriado.
   - Enter ou blur → tenta salvar. Esc → cancela.
   - Optimistic update via react-query.
   - Em erro, faz rollback visual + toast.error com a mensagem.
   - Loading state durante save (spinner discreto).

2. Já existe o helper `updateRecordField(...)` em `src/services/activitiesService.ts`. Use esse — ele já cria activity property_change automaticamente.

3. Se já existem `updateContactProperty` / `updateCompanyProperty` / `updateDealProperty` no service (Codex pode ter criado em runs anteriores), use eles. Caso contrário, use `updateRecordField` direto.

4. Wire em ContactDetail (`src/pages/crm/ContactDetail.tsx`):
   Sidebar direita ganha campos editáveis:
   - name (text)
   - email (text com validação básica de email)
   - whatsapp (text)
   - phone (text)
   - role (text)
   - lifecycle_stage (select: subscriber/lead/mql/sql/opportunity/customer/evangelist/disqualified)
   - source (select com CONTACT_SOURCES de @/types)
   - seniority (select com SENIORITY_LABEL keys)

5. Wire em CompanyDetail (`src/pages/crm/CompanyDetail.tsx`):
   - name (text)
   - cnpj (text)
   - city (text)
   - segment (text)
   - website (text)
   - linkedin_url (text)
   - sales_model (select: internal/external/hybrid)
   - status (select: new/prospecting/contacted/meeting_booked/proposal/customer/lost)
   - buying_signal (select: hot/warm/cold)
   - vgv_projected (currency)

6. Wire em DealDetail (`src/pages/crm/DealDetail.tsx`):
   - title (text)
   - value (currency)
   - stage (select com DEAL_STAGES)
   - expected_close (date)

CRITÉRIO DE ACEITE
- Clico num campo da sidebar → entra em edit mode.
- Salvo → valor persiste no banco + activity `kind='property_change'` aparece na timeline com `payload.field`, `payload.old`, `payload.new`.
- Erro de validação → toast + não salva.
- TSC `npx tsc --noEmit` passa.
- Páginas existentes (Launches, Signals, Cadência, etc.) não quebram.

ENTREGÁVEIS
- `src/components/inline/InlineEdit.tsx` (novo)
- 3 pages Detail editadas
- `docs/PHASE_1G_DONE.md` (resumo + como testar)
- `docs/CRM_ROADMAP.md` atualizado: marcar Phase 1G como done; marcar Onda 1 como done.

REGRAS
- Não tocar em activities table, RPC ingest, ou extensão.
- Se faltar coluna no banco (ex: source novo), apenas adicione no `<select>` sem migration nova.
- Optimistic update com rollback. Não deixar a UI travada.
- Não criar testes E2E. TSC e revisão visual local bastam.
```

---

### PROMPT — Onda 2 (Lists robustas)

```
Você é um agente engenheiro pegando a Onda 2 do CRM Pipa Driven (`seamless-crm-suite/`). Leia `docs/CRM_ROADMAP.md` e `docs/CODEX_HANDOFF.md` §6 antes de mexer.

Estado: Onda 0 e Onda 1 (Phases 1A→1G) completas. Sua missão é tornar as list views (Contatos, Empresas, Deals) confiáveis com 10k+ rows.

ESCOPO

1. Tabela virtualizada
   - Substituir <Table> tradicional por `@tanstack/react-virtual` (já está no `package.json`? se não, adicionar).
   - Performance: 10k linhas, scroll fluido (60fps), tempo de filtro <500ms.
   - Aplicar em `src/pages/crm/Contacts.tsx`, `src/pages/crm/Companies.tsx` e (se aplicável) `src/pages/crm/Deals.tsx`.

2. Colunas configuráveis
   - Botão "Colunas" no toolbar abre dropdown com checkboxes pra cada coluna possível.
   - Salvar preferência em `localStorage` (chave: `pipa-cols-contacts`, `pipa-cols-companies`, etc.).
   - Default sensato: 6-8 colunas mais relevantes.

3. Filtros avançados
   - Componente novo `src/components/lists/AdvancedFilters.tsx`.
   - Suporta: texto (contains/equals/not_equals/starts_with), número (gt/lt/between), data (between), enum (in).
   - AND/OR groups (uma camada só, sem nesting infinito).
   - UI: chips no topo da tabela. Click no chip pra editar. "+ Adicionar filtro" abre menu.

4. Listas salvas
   - Tabela nova: `public.lists` com colunas: `id uuid pk default gen_random_uuid()`, `owner_id uuid references profiles(id)`, `name text not null`, `entity text not null check (entity in ('contacts','companies','deals'))`, `filters jsonb not null default '[]'::jsonb`, `columns jsonb`, `created_at timestamptz default now()`.
   - RLS: owner read/write próprios; admin read all.
   - Migration: `supabase/migrations/YYYYMMDD_lists_table.sql` (idempotente).
   - UI: dropdown "Listas salvas" no header da página, com "+ Salvar lista atual" e botão de remover por item.

5. Busca por texto livre
   - Input de busca no toolbar.
   - Filtra client-side em name/email/phone/company name (Contacts), name/cnpj/website/segment (Companies), title/contact.name/company.name (Deals).
   - Debounced 200ms.

6. Bulk actions
   - Checkbox em cada row + checkbox no header (select-all visible / select-all matching filter).
   - Toolbar de ações aparece quando >0 selecionados: atribuir owner (select), adicionar a sequence (modal placeholder OK por enquanto), exportar CSV, deletar (com AlertDialog).
   - Atribuir owner: `update contacts/companies/deals set owner_id = X where id in (...)`.
   - Exportar CSV: gera `.csv` cliente-side (sem ir ao banco) com as colunas visíveis.

7. Importar CSV
   - Modal "Importar contatos/empresas/deals" com:
     - Drop de arquivo ou click pra selecionar
     - Preview das primeiras 5 linhas
     - Mapeamento de coluna do CSV → campo do banco (UI tipo `Select` por coluna)
     - Dedup por email (Contacts), cnpj (Companies), title (Deals — ou idempotência por title+company_id)
     - Botão "Importar" → processa em batches de 100 via `supabase.from(table).upsert(...)` ou insert ignorando duplicatas.
   - Reaproveitar `src/components/crm/ImportCSV.tsx` se existir; se não, criar em `src/components/lists/ImportCSVModal.tsx`.

CRITÉRIO DE ACEITE
- 10k contatos filtrados em <500ms.
- Lista salva reabre com mesmo resultado depois de logout/login.
- CSV de 5k linhas importa sem duplicar.
- Busca por texto livre achar resultado em <200ms.
- TSC limpo.

ENTREGÁVEIS
- Files novos em `src/components/lists/`.
- `src/services/listsService.ts` (CRUD da tabela `lists`).
- Migration `supabase/migrations/YYYYMMDD_lists_table.sql`.
- 3 pages atualizadas: Contacts, Companies, (Deals se vier list view dedicada).
- `docs/ONDA_2_DONE.md` com instruções pra rodar a migration + como testar.
- `docs/CRM_ROADMAP.md` atualizado.

REGRAS
- Migration idempotente, sem DROP.
- RLS obrigatório na nova tabela.
- Não quebrar layout atual: progressive enhancement.
- Nada de virtualização horizontal — só vertical.
- Performance é critério: se a tabela engasgar com 1k rows já tá errado.
```

---

### PROMPT — Onda 3 (Pipeline Kanban polido)

```
Você é um agente engenheiro pegando a Onda 3 do CRM Pipa Driven (`seamless-crm-suite/`). Leia `docs/CRM_ROADMAP.md` e `docs/CODEX_HANDOFF.md` §6 antes.

Estado: Onda 0, Onda 1, Onda 2 completas. Você está fazendo o Kanban de Deals funcionar como Pipedrive.

ESCOPO

1. Reescrever `src/pages/funil/Kanban.tsx` (preservar a rota existente).
   - Cada coluna = um stage de DEAL_STAGES (de `@/types`).
   - Cards = deals com title, valor formatado, dias em stage, foto/iniciais do owner.
   - Soma de valor agregado no topo de cada coluna.

2. Drag-drop entre colunas
   - Lib: `@dnd-kit/core` + `@dnd-kit/sortable` (provavelmente já está; senão adicionar).
   - Optimistic update: card move imediatamente, mutation rola em background.
   - Em erro, rollback visual + toast.
   - Em sucesso, criar activity `kind='stage_change'` automaticamente via `createStageChangeActivity` (já existe em `src/services/activitiesService.ts`).

3. Filtros no header
   - Owner (multi-select dos profiles)
   - Source (multi-select)
   - Date range (data de criação)
   - Reseta com botão "Limpar"
   - Persistir em URL search params (`?owner=...&source=...`).

4. Click no card
   - Navega pra `/crm/negocios/:id` (DealDetail já existe).

5. Header da página
   - Botão "+ Novo deal" abre `<DealForm>` existente.
   - Total geral (soma de todos os deals visíveis).
   - Toggle "Ver: todos / só meus" (filtra owner_id = auth.uid()).

6. Performance
   - Se >300 deals, usar virtualização vertical dentro de cada coluna.
   - Cards com `useMemo` pra evitar re-render desnecessário.

CRITÉRIO DE ACEITE
- Arrasto deal entre stages → timeline do deal mostra o `stage_change` em <2s.
- Soma do topo de cada coluna bate com soma manual dos cards visíveis (com filtros aplicados).
- 100 deals: drag fluido (60fps).
- TSC limpo.

ENTREGÁVEIS
- `src/pages/funil/Kanban.tsx` reescrito.
- `src/components/funil/DealCard.tsx` (novo) ou similar.
- `docs/ONDA_3_DONE.md`.
- `docs/CRM_ROADMAP.md` atualizado.

REGRAS
- Não tocar em DealForm, ContactDetail, etc.
- Não criar nova migration.
- Stage change deve criar activity `kind='stage_change'` no banco; sem isso a aceitação falha.
- Optimistic update com rollback obrigatório.
```

---

### PROMPT — Onda 4 (Today / Inbox)

```
Você é um agente engenheiro pegando a Onda 4 do CRM Pipa Driven (`seamless-crm-suite/`). Leia `docs/CRM_ROADMAP.md` e `docs/CODEX_HANDOFF.md` §6.

Estado: Onda 0–3 completas. Sua missão é fazer o "Comando do Dia" (`HojePage`) virar uma list vertical 100% acionável.

ESCOPO

Reescrever `src/pages/HojePage.tsx`. Layout vertical, sem aba, sem clique extra.

SEÇÕES (na ordem):
1. **Tarefas atrasadas** (`activities` where `kind='task'` AND `payload->>'status'='pending'` AND `payload->>'due_date' < today` AND owner = me)
2. **Tarefas de hoje** (mesmo, due_date = today)
3. **Inbound sem resposta** — WhatsApp ou email recebidos nas últimas 48h sem resposta minha (heurística: última activity do contato é `direction='in'`)
4. **Follow-ups de cadência** — `cadence_tracks` ou `daily_tasks` que vencem hoje
5. **Sinais quentes ABM** — `account_signals` recentes com `confidence > 0.7` em companies do meu portfólio

CADA ITEM:
- Ícone à esquerda (CircleCheck pra task, MessageCircle pra whatsapp, Mail pra email, Zap pra signal)
- Título (truncated)
- Subtítulo: nome do contato/empresa + tempo relativo ("há 3h")
- Ação primária à direita: 1 clique:
  - Task: ✓ marcar concluída (chama `setTaskStatus`)
  - Inbound msg: → abrir conversa do contato (`/crm/contatos/:id?tab=whatsapp`)
  - Follow-up: ✓ marcar feito (cria activity)
  - Signal: → abrir empresa
- Ação secundária (menu kebab): reagendar, snooze, ignorar

COMPORTAMENTO:
- Quando marcar feito, item DESAPARECE imediatamente da lista (optimistic).
- Contador total no topo + por seção: "12 itens hoje".
- Polling 60s.
- Empty state amigável: "Nada pra hoje. Cuida de você."

SIDEBAR:
- Badge no item "Comando do Dia" do `AppSidebar.tsx` mostrando contador total.
- Atualizar via `useQuery` separada com poll 60s.

CRITÉRIO DE ACEITE
- Lista vertical, sem abas, sem cliques desnecessários.
- Marca task feita → some.
- Badge na sidebar reflete o número exato de items pendentes.
- Carrega em <1s pra usuário com 50 itens.
- TSC limpo.

ENTREGÁVEIS
- `src/pages/HojePage.tsx` reescrito.
- `src/services/inboxService.ts` (novo): funções `getOverdueTasks`, `getTodayTasks`, `getUnrepliedInbound`, `getCadenceFollowups`, `getHotSignals`.
- `src/components/AppSidebar.tsx` com badge.
- `docs/ONDA_4_DONE.md`.
- `docs/CRM_ROADMAP.md` atualizado.

REGRAS
- Sem nova tabela. Reusa `activities`, `cadence_tracks`, `daily_tasks`, `account_signals` que já existem.
- Não bagunçar HojePage atual antes de testar substituição funciona.
- Heurística de "sem resposta" pode ser simples (última activity = inbound).
```

---

### PROMPT — Onda 5 (Sequences funcionais)

```
Você é um agente engenheiro pegando a Onda 5. Leia `docs/CRM_ROADMAP.md` e `docs/CODEX_HANDOFF.md` §6.

Estado: Ondas 0–4 done. Sua missão é fazer cadências automáticas que efetivamente enviam.

ESCOPO

1. Schema (migration `supabase/migrations/YYYYMMDD_sequences_engine.sql`)
   - `sequences` (já existe, manter compatibilidade): id, name, channel ('whatsapp'|'email'|'both'), active.
   - `sequence_steps` (já existe): sequence_id, position, channel, delay_days, template (string com placeholders {{nome}}, {{empresa}}).
   - `sequence_enrollments`: id, sequence_id, contact_id, status ('active'|'paused'|'completed'|'unenrolled'|'errored'), current_step, started_at, last_step_at, error_msg, owner_id.
   - RLS owner-based em todas.

2. Builder visual (`src/pages/SequenciaBuilderPage.tsx` já existe — refinar)
   - Form: nome, canal, lista de steps com delay + template.
   - Drag-drop pra reordenar steps.
   - Preview do template renderizado com placeholders substituídos por valores fake.
   - Save → upsert em `sequences` + diff em `sequence_steps`.

3. Worker — Edge Function `supabase/functions/run-sequences/index.ts`
   - Cron-style (chamado a cada 10min via Supabase scheduler ou trigger).
   - Loop:
     - Pega enrollments active onde `now() - last_step_at >= step.delay_days`.
     - Renderiza template com dados do contact (nome, empresa, role).
     - Envia via canal:
       - WhatsApp: chama webhook do n8n (`integrations` table tem url) que aciona a extensão Chrome do vendedor (mecanismo já existente, ver `extension/background.js`).
       - Email: usa Supabase Edge ou Resend (configurar via env var `RESEND_API_KEY`; se não tiver, marca `errored`).
     - Cria activity `kind='sequence_step'` com payload `{sequence_id, step_index, channel, template, body_rendered}`.
     - Avança `current_step` ou marca `completed`.
   - Respeitar horário comercial: 9h-18h horário Brasília, dias úteis.

4. Unenroll automático
   - Trigger SQL ou na RPC `ingest_whatsapp_chat`: quando `direction='inbound'` chega de um contato com enrollment ativo, marca enrollment `status='unenrolled'` + cria activity `kind='enrollment'` com `payload.unenrolled=true`.

5. UI de gerenciamento
   - `src/pages/SequenciasPage.tsx` lista sequences com contadores (active/completed/errored enrollments).
   - Click numa sequence → builder.
   - Botão "Enrollar contatos" → modal com seletor de contatos (multi).
   - Status visual de cada enrollment numa tab "Enrollments".

CRITÉRIO DE ACEITE
- Crio sequence de 3 steps (1d / 2d / 3d), canal WhatsApp.
- Enrollo 5 contatos.
- Worker dispara, cada contato recebe os 3 messages nos dias certos.
- Se 1 contato responder no dia 2, fica em `unenrolled` e não recebe step 3.
- Timeline do contato mostra cada `sequence_step` executado.
- Migrations idempotentes.
- TSC limpo. Edge Function deploya sem erro.

ENTREGÁVEIS
- Migration `YYYYMMDD_sequences_engine.sql`.
- Edge Function `supabase/functions/run-sequences/index.ts`.
- Frontend: SequenciasPage e SequenciaBuilderPage atualizados.
- `src/services/sequencesService.ts` ampliado.
- `docs/ONDA_5_DONE.md` com como testar end-to-end (incluindo configurar cron).
- `docs/CRM_ROADMAP.md` atualizado.

REGRAS
- Worker DEVE ser idempotente: se rodar 2x no mesmo minuto, não duplica steps.
- Email é nice-to-have. Se RESEND_API_KEY ausente, falha graciosamente com `errored`, não trava.
- WhatsApp send deve passar pela extensão (sem ban risk de servidor enviando).
- Trigger de unenroll obrigatório.
```

---

### PROMPT — Onda 6 (Reports mínimos)

```
Você é um agente engenheiro pegando a Onda 6. Leia `docs/CRM_ROADMAP.md` e `docs/CODEX_HANDOFF.md` §6.

Estado: Ondas 0–5 done. Sua missão é entregar dashboards mínimos que diretor olha 1x por semana.

ESCOPO

Reescrever (ou criar) `src/pages/ReportsPage.tsx` com 4 cards:

1. **Funil de conversão**
   - Bar chart vertical: cada stage com (entraram, saíram, conversão %).
   - Filtro de data range no header (default últimos 30 dias).
   - Query: `select stage, count(*) entered_count from deal_history join stages... group by stage`.

2. **Velocity**
   - Tempo médio em cada stage (em dias).
   - Source: `deal_history` com diff de `moved_at` consecutivos por deal.

3. **Performance por owner**
   - Tabela: owner | deals fechados | valor total fechado | conversão geral.
   - Filtro de mês.

4. **Atividade por dia**
   - Line chart com series: msgs enviadas, msgs recebidas, calls, notes — agrupados por dia, últimos 14 dias.
   - Source: `activities` com filter por kind.

Usar `recharts` (provavelmente já está instalado; senão adicionar).

ROTAS:
- `/relatorios` ou substituir `/metricas`.
- Adicionar item no `AppSidebar.tsx` se não tiver.

CRITÉRIO DE ACEITE
- Os 4 cards renderizam com dados reais.
- Filtro de data altera os 4 cards juntos.
- Loading state decente (skeletons).
- Mobile responsivo (cards empilham).
- TSC limpo.

ENTREGÁVEIS
- `src/pages/ReportsPage.tsx`.
- `src/services/reportsService.ts` com queries agregadas.
- `src/components/reports/*` (FunnelChart, VelocityCard, OwnerLeaderboard, ActivityChart).
- Talvez uma view materializada em SQL pra acelerar (opcional, só se queries simples ficarem lentas).
- `docs/ONDA_6_DONE.md`.
- `docs/CRM_ROADMAP.md` atualizado.

REGRAS
- Sem nova tabela. Pure aggregations sobre o que já existe.
- Polling 5min (reports não precisa real-time).
- Sem export PDF/PNG nesta onda — fica pra depois.
```

---

### PROMPT — Onda 7 (Settings no-code)

```
Você é um agente engenheiro pegando a Onda 7. Leia `docs/CRM_ROADMAP.md` e `docs/CODEX_HANDOFF.md` §6.

Estado: Ondas 0–6 done. Sua missão é tirar o admin do banco direto pra mexer em coisas que ele deveria mexer pela UI.

ESCOPO

Criar/refazer `src/pages/SettingsPage.tsx` com tabs:

1. **Usuários e times**
   - Tabela de profiles com role, last_seen, created_at.
   - Admin pode mudar role (user ↔ admin).
   - Convidar novo usuário (email → magic link via supabase.auth.admin.inviteUserByEmail; precisa Edge Function pra service role key).

2. **Pipelines e stages**
   - Lista de funnels existentes.
   - Click → editar stages (drag-drop reorder, rename, add/remove stage).
   - Cada stage tem: name, order, default_probability (0-100).
   - Migration: garantir que stages tem `probability` int default 0.

3. **Custom fields**
   - Tabela nova: `properties_schema` (id, entity 'contact'|'company'|'deal', field_key text unique per entity, label, type 'text'|'number'|'date'|'enum', options jsonb, required bool, created_at).
   - UI: lista por entity + form de adicionar.
   - **Não** alterar tabela contacts/companies/deals — guarda valores em `custom_props` jsonb que já existe (Onda 0 model).
   - Frontend: ContactDetail/CompanyDetail/DealDetail leem `properties_schema` por entity e renderizam campos extras na sidebar direita usando o `<InlineEdit>` da Phase 1G.

4. **Templates de mensagem**
   - Tabela `message_templates` (id, channel 'whatsapp'|'email', name, subject, body com placeholders, owner_id).
   - UI: CRUD simples + preview com placeholders.
   - Reutilizar no Sequence Builder.

5. **Integrações**
   - Reaproveitar `src/pages/dados/Integrations.tsx`.
   - Adicionar status visual de cada integração (connected/error/disconnected).

CRITÉRIO DE ACEITE
- Admin adiciona custom field "Tamanho de empresa" (enum: 1-10, 11-50, 51-200, 200+).
- Campo aparece em CompanyDetail sidebar e é editável inline.
- Salvo, persiste em `custom_props` da company.
- Filtro nas list views (Onda 2) reconhece custom fields.
- Migrations idempotentes.
- TSC limpo.

ENTREGÁVEIS
- Migration `YYYYMMDD_settings_tables.sql` (properties_schema + message_templates).
- `src/pages/SettingsPage.tsx`.
- `src/components/settings/*`.
- `src/services/settingsService.ts`.
- Edge Function `invite-user` (se admin invite for implementado).
- `docs/ONDA_7_DONE.md`.
- `docs/CRM_ROADMAP.md` atualizado: marcar Onda 7 done; **MVP CRM Pipa Driven completo**.

REGRAS
- Custom fields NÃO alteram schema das tabelas principais. Só `custom_props`.
- Properties_schema com `field_key` único por entity (constraint).
- RLS: admin escreve, todos autenticados leem.
- Não dropar nada existente.
```

---

## Status atual do roadmap (referência)

- [x] Onda 0 — Consolidação
- [x] Onda 1 — Phases 1A → 1G
- [x] Onda 2 — Lists robustas
- [x] Onda 3 — Pipeline Kanban
- [x] Onda 4 — Today / Inbox
- [x] Onda 5 — Sequences funcionais (linear, estilo Mailchimp 2010)
- [x] Onda 6 — Reports mínimos
- [x] Onda 7 — Settings no-code
- [ ] **Onda 8 — Sequences Apollo-style** (builder visual + branching + step types) ← prioridade pra diferenciar
- [ ] **Onda 9 — Email integration real** (OAuth Gmail/Outlook + tracking) ← bloqueia Onda 8 multicanal
- [ ] **Onda 10 — Notifications + mentions**
- [ ] **Onda 11 — Search global + mobile responsive + polish**

MVP atual ≈ HubSpot Starter. Pós-Onda 8/9 = competitivo com Apollo Outbound.

---

### PROMPT — Onda 8 (Sequences Apollo-style, builder visual node-based)

```
Você é um agente engenheiro pegando a Onda 8 do CRM Pipa Driven (`seamless-crm-suite/`). Leia `docs/CRM_ROADMAP.md` e `docs/CODEX_HANDOFF.md` §6 antes.

Estado: Sequences atual (Onda 5) é linear: lista de steps com {channel, delay_days, template}. Sua missão é reescrever pra estilo Apollo.io — builder visual node-based, step types ricos, branching, A/B test, stats.

NÃO QUEBRE A ONDA 5: o schema atual (`sequences`, `sequence_steps`, `cadence_tracks`) precisa continuar funcionando para enrollments existentes ou migrados. Toda mudança é aditiva.

ESCOPO

1. SCHEMA NOVO (migration `supabase/migrations/YYYYMMDD_sequences_v2.sql`, idempotente):
   - Tabela `sequence_steps_v2`: id, sequence_id (FK), position int, step_type text CHECK IN ('email_manual', 'email_auto', 'call_task', 'linkedin_task', 'whatsapp_task', 'wait', 'condition'), config jsonb, created_at.
   - `sequence_step_runs`: id, enrollment_id (FK cadence_tracks), step_id (FK sequence_steps_v2), run_at, status text CHECK IN ('queued','sent','skipped','failed'), channel text, message_id text, opened_at timestamptz, clicked_at timestamptz, replied_at timestamptz, error_msg text.
   - Indexes em (enrollment_id, run_at), (step_id), (sequence_id) onde fizer sentido.
   - RLS owner-based.
   - Enum SQL types se necessário.

   Schema do `config` por step_type:
   - `email_*`: `{ subject_template, body_template, variants?: [{ subject, body, weight }] }`
   - `call_task`: `{ prompt, suggested_minutes }`
   - `whatsapp_task`: `{ template_id?, body_template, attachments? }`
   - `linkedin_task`: `{ action: 'view'|'connect'|'message', body_template? }`
   - `wait`: `{ days, business_hours_only: bool, stop_if_replied: bool }`
   - `condition`: `{ check: 'replied'|'opened'|'clicked'|'meeting_booked', if_true_step_position, if_false_step_position }`

2. BUILDER VISUAL (`src/pages/SequenceBuilderV2.tsx`):
   - Lib: `reactflow` (adicionar ao package.json se faltar).
   - Canvas com zoom + pan + minimap.
   - Sidebar esquerda: paleta de step types arrastáveis.
   - Drag um node pro canvas → cria step da position correta.
   - Click num node → painel direito com config form (campos baseados em step_type).
   - Edges (linhas) entre nodes representam fluxo. Default: linear position N → N+1. Pra `condition`, 2 edges (true/false).
   - Auto-validação: nodes desconectados = warning amarelo. Loop infinito = erro vermelho.
   - Templates com variáveis dinâmicas: `{{first_name}}`, `{{company}}`, `{{role}}`, `{{custom.<field_key>}}`. Mostra autocomplete em hover do input.
   - Preview side-panel: dados de contato fake renderizando o template real.

3. WORKER NOVO (`supabase/functions/sequence-worker-v2/index.ts`, OU refatorar o atual com flag `use_v2`):
   - Cron 10min.
   - Pra cada enrollment ativo:
     - Pega step atual.
     - Se step_type='wait': checa se passou tempo + business_hours_only (9-18h Brasília, dias úteis) + stop_if_replied (lê `sequence_step_runs.replied_at` ou activities recentes do contato).
     - Se step_type='condition': lê step_runs anteriores, decide próximo position.
     - Se step_type='email_*': renderiza template (variáveis), envia via Gmail/Outlook (Onda 9 dependency) ou Resend; salva message_id.
     - Se step_type='call_task'/'linkedin_task': cria activity kind='task' com payload pra rep ver na HojePage.
     - Se step_type='whatsapp_task': dispara webhook n8n → extensão Chrome do owner envia.
     - Em sucesso, INSERT em `sequence_step_runs` + UPDATE enrollment current_step.
     - Em falha, marca step_run status='failed' + error_msg, mas NÃO trava enrollment (continua próximo step).
   - Idempotente: se rodar 2x no mesmo minuto, dedup por (enrollment_id, step_id).
   - Respeita weekday/business hours obrigatoriamente.

4. UNENROLL TRIGGER (já existe via `unenroll_active_cadence_tracks_for_deal_stage` em 20260425_sequence_worker_support.sql; ampliar):
   - Trigger `on_activity_inbound` em `activities`: quando inserir activity com direction='in' e kind='whatsapp'/'email', marca enrollments active do contact_id como `unenrolled` se config global "stop on reply" ativada por sequence.
   - Sequence ganha campo `stop_on_reply boolean DEFAULT true`.

5. STATS (frontend, na SequenciasPage):
   - Tab "Stats" em cada sequence.
   - Por step (lendo step_runs agregado): sent, opened, clicked, replied, conversion %.
   - Funnel chart vertical mostrando drop-off entre steps.
   - Tabela de enrollments com filtro por status.

6. BULK ENROLL:
   - Modal "Enrollar em sequence" recebe enrollments por `contact_id` ou um `list_id` (Onda 2).
   - Cria N enrollments (insert batch em `cadence_tracks` com status='active', sequence_id, contact_id, position=0).
   - Respeita quota diária se config: `sequence.max_enrollments_per_day int`.

7. MIGRAR DADOS LEGADOS (opcional, peça autorização):
   - Pra cada `sequence_steps` legacy, criar 1 row `sequence_steps_v2` com step_type='email_auto' ou 'whatsapp_task' (mapeado por channel).
   - Não DELETAR a tabela velha. Deixar pra remover depois de validação.

CRITÉRIO DE ACEITE
- Crio sequence visual com 5 nodes: email_auto → wait(2 dias) → condition(replied?) → [if_true: end] [if_false: whatsapp_task] → wait(3 dias) → call_task.
- Enrollo 5 contatos.
- Worker dispara nos horários certos respeitando 9-18h Brasília.
- 1 contato responde no dia 2 → enrollment marca unenrolled, não continua.
- Tab Stats mostra: 5 sent, 1 replied, conversion 20%.
- TSC limpo. Edge Function deploya sem erro.
- Migrations idempotentes. Schema antigo (Onda 5) não quebra.

ENTREGÁVEIS
- Migration `YYYYMMDD_sequences_v2.sql`.
- Edge Function `supabase/functions/sequence-worker-v2/index.ts`.
- `src/pages/SequenceBuilderV2.tsx` + componentes node-based em `src/components/sequence-builder/`.
- `src/services/sequencesV2Service.ts`.
- `src/components/sequence-stats/SequenceStats.tsx`.
- `docs/ONDA_8_DONE.md` com como deployar Edge Function + agendar cron + como testar end-to-end.
- `docs/CRM_ROADMAP.md` atualizado.

REGRAS
- Aditivo: NÃO dropar `sequence_steps` antigo.
- Worker idempotente OBRIGATÓRIO.
- Unenroll trigger não pode causar deadlock (use SECURITY DEFINER + search_path).
- ReactFlow é pesado: lazy-load só quando abrir o builder.
- Email send depende da Onda 9 (Gmail/Outlook OAuth). Se Onda 9 não pronta, fallback pra Resend ou skip step com warning.
- A/B test: implemente bare-metal (random.weighted entre variants do config); analytics aparecem em Stats.
```

---

### PROMPT — Onda 9 (Email integration real: Gmail/Outlook OAuth + tracking)

```
Você é um agente engenheiro pegando a Onda 9 do CRM Pipa Driven. Leia `docs/CRM_ROADMAP.md` e `docs/CODEX_HANDOFF.md` §6.

Estado: Sequences (Onda 5/8) e Quick Actions (Onda 1F) mencionam email mas não tem provedor real conectado. Sua missão é dar OAuth + send + track via provider externo.

ESCOPO

1. OAUTH PROVIDERS
   - Suportar Gmail (Google OAuth) e Outlook (Microsoft Graph).
   - Edge Function `supabase/functions/oauth-callback/index.ts` que recebe code, troca por access+refresh token, salva em `email_accounts` table.
   - `email_accounts`: id, owner_id (FK profiles), provider ('gmail'|'outlook'), email_address text, access_token text encrypted, refresh_token text encrypted, expires_at timestamptz, scopes text[], connected_at, status ('active'|'expired'|'revoked').
   - Settings page (Onda 7) ganha aba "Email": botão "Conectar Gmail" / "Conectar Outlook" → OAuth flow.
   - Tokens encrypted com `pgcrypto` ou via env var SECRET_KEY.

2. SEND EMAIL VIA PROVIDER
   - Service `src/services/emailService.ts`:
     - `sendEmail({ accountId, to, subject, body, html?, replyTo? })` → escolhe provider baseado em `email_accounts.provider`.
     - Gmail: POST `https://gmail.googleapis.com/gmail/v1/users/me/messages/send` com raw RFC 5322.
     - Outlook: POST `https://graph.microsoft.com/v1.0/me/sendMail`.
     - Refresh token automático antes de send se `expires_at` próximo.
     - Retorna `{ message_id, thread_id }`.

3. EMAIL TRACKING
   - **Open**: pixel transparente 1x1 PNG servido por Edge Function `email-pixel`. URL: `https://<project>.supabase.co/functions/v1/email-pixel?msg=<message_id>`. Inserir em emails como `<img src=...>`. Quando carrega, atualiza `email_tracking.opened_at`.
   - **Click**: link wrapping. Edge Function `email-redirect?msg=<id>&u=<url>`. Loga click + redirect 302.
   - **Reply**: webhook do Gmail (Pub/Sub) ou polling da inbox via Outlook. Quando detectar reply na thread, atualiza `email_tracking.replied_at` + cria activity kind='email' direction='in' linkando ao contact via reverse-lookup do email.

4. SCHEMA
   - Migration `YYYYMMDD_email_integration.sql` idempotente.
   - `email_tracking`: id, message_id, account_id, contact_id, direction, subject, body_preview, sent_at, opened_at, clicked_at, replied_at, error_msg.
   - Trigger: ao INSERT em `email_tracking` direction='out', cria activity kind='email' com payload referenciando.

5. WIRING
   - `EmailComposeModal.tsx`: usado por Quick Actions (Onda 1F) + Sequence steps (Onda 8). Campos: from (account picker), to, cc/bcc, subject, body (rich text via tiptap ou textarea por enquanto), templates dropdown (lê `message_templates` Onda 7).
   - Wire em ContactDetail header: botão "Email" abre modal preenchido com contact.email.
   - `<ActivityTimeline />` já tem `EmailItem` que renderiza activity kind='email' — confirme que payload bate.

6. INBOX SYNC (opcional fase posterior, document isso)
   - Polling 5min puxando últimos N emails da inbox conectada.
   - Match com contacts existentes via from/to email.
   - Cria activities kind='email' direction='in'.

CRITÉRIO DE ACEITE
- Conecto Gmail nas Settings.
- ContactDetail → Email → mando email teste pro lead.
- Email chega na inbox dele com pixel + links wrapped.
- Lead abre → opened_at populado, timeline mostra "🟢 Email aberto há 1min".
- Lead clica num link → clicked_at populado.
- Lead responde → activity kind='email' direction='in' aparece na timeline + sequence enrollment marca como replied.
- TSC limpo.

ENTREGÁVEIS
- Migration `YYYYMMDD_email_integration.sql`.
- Edge Functions: `oauth-callback`, `email-pixel`, `email-redirect`, `gmail-webhook` (Pub/Sub).
- `src/services/emailService.ts`.
- `src/components/email/EmailComposeModal.tsx`.
- Settings tab "Email accounts" wirada.
- ENV vars documentadas: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `MICROSOFT_CLIENT_ID`, etc.
- `docs/ONDA_9_DONE.md` com setup OAuth (Console Google/Azure) + variáveis.

REGRAS
- Tokens NUNCA expostos pro client (só Edge Functions leem). Frontend só vê email_address e status.
- Refresh token: se rotation detectado pelo provider, atualizar imediatamente.
- Pixel + redirect endpoints: rate-limit (1 req/sec por IP) pra evitar abuse.
- Reply-to header configurável pra rede de domain reputação.
- HTML emails: sanitize input antes de mandar (anti XSS no preview).
- Se RESEND_API_KEY estiver presente como fallback, usar quando OAuth account não disponível, mas sem tracking nesse caso.
```

---

### PROMPT — Onda 10 (Notifications in-app + mentions em notas)

```
Você é um agente engenheiro pegando a Onda 10. Leia `docs/CRM_ROADMAP.md` e `docs/CODEX_HANDOFF.md` §6.

Estado: Não há notificações in-app. Reps só descobrem novos leads pela HojePage. Sua missão é adicionar bell icon com feed de notificações e suporte a @mentions em notas.

ESCOPO

1. SCHEMA (migration `YYYYMMDD_notifications.sql`)
   - `notifications`: id, recipient_id (FK profiles), kind ('mention'|'lead_replied'|'task_due_soon'|'sequence_replied'|'deal_stage_change'|'signal_hot'|'system'), title text, body text, link text (URL relativa pra abrir o registro), payload jsonb, read_at timestamptz null, created_at, expires_at timestamptz nullable.
   - Index (recipient_id, read_at, created_at desc).
   - RLS: usuário só lê/atualiza próprias.

2. TRIGGERS / GERAÇÃO AUTOMÁTICA
   - Activity insert direction='in' kind='whatsapp'|'email' → notification kind='lead_replied' pro owner do contato.
   - Activity insert kind='task' onde payload.due_date <= today+1 → notification kind='task_due_soon' pro assignee.
   - Account_signals insert com confidence > 0.7 → notification kind='signal_hot' pro owner da company.
   - Deal stage_change → notification kind='deal_stage_change' pro owner do deal.
   - Activity kind='note' com mentions → notification kind='mention' pra cada user mencionado.

3. UI — BELL ICON (`src/components/NotificationBell.tsx`)
   - Posição: header da app (próximo do avatar).
   - Badge com count de unread.
   - Click abre dropdown com últimas 20 notifications.
   - Ícone por kind, título + body + tempo relativo.
   - Click numa notif: navega pra link + marca como read.
   - Botão "Marcar todas como lidas".
   - Polling 30s OU Supabase Realtime channel pra updates instantâneos.

4. MENTIONS EM NOTAS
   - `src/components/notes/NoteEditor.tsx` (refatorar atual textarea):
     - Detecta `@` digitado → abre popover com lista de profiles filtrada.
     - Selecionar user insere `@nome` no texto + adiciona ao array `mentions: string[]`.
     - Highlight visual de mentions ao renderizar.
   - Quando salvar note, payload tem `mentions: [profile_id, ...]`.
   - Trigger DB cria notification pra cada mention.

5. SETTINGS — preferências
   - Aba "Notificações" em Settings (Onda 7):
     - Checkbox por kind: receber in-app? receber email?
     - Salvo em `notification_preferences` (id, user_id, kind, in_app bool, email bool).

6. EMAIL DIGEST (opcional — flag pra ativar)
   - Edge Function `notifications-digest` (cron diário 8h):
     - Pra cada user, agrega notifications da última 24h não lidas.
     - Manda email digest se `notification_preferences.kind=*.email = true`.

CRITÉRIO DE ACEITE
- Lead responde → bell icon ganha badge +1 em <1min.
- Click na notif abre o contato + marca read.
- Em qualquer note, digito `@joão` → autocomplete sugere usuários.
- Salvo, joão recebe notif kind='mention'.
- Tab Notificações em Settings permite mutar kind.
- TSC limpo.

ENTREGÁVEIS
- Migration `YYYYMMDD_notifications.sql`.
- Triggers SQL pra geração automática.
- Edge Function `notifications-digest` (opcional).
- `src/components/NotificationBell.tsx` + dropdown.
- `src/components/notes/NoteEditor.tsx` com mention picker.
- `src/services/notificationsService.ts`.
- Settings tab Notificações.
- `docs/ONDA_10_DONE.md`.

REGRAS
- Triggers: SECURITY DEFINER + idempotência (não duplicar notifs por evento repetido).
- Mention picker: debounce de 150ms na busca.
- Realtime: usar Supabase channel se infra suportar; senão polling 30s.
- expires_at: notifs antigas (>30 dias) auto-deleted via cron diário.
- Não notificar o próprio user que gerou o evento (ex: eu loguei call → eu não recebo notif).
```

---

### PROMPT — Onda 11 (Search global + mobile responsive + polish)

```
Você é um agente engenheiro pegando a Onda 11. Leia `docs/CRM_ROADMAP.md` e `docs/CODEX_HANDOFF.md` §6.

Estado: Falta search global, mobile UX e polish em geral. Sua missão é fechar UX gaps que impedem uso fluido.

ESCOPO

1. SEARCH GLOBAL (CMD+K / CTRL+K)
   - Componente `src/components/CommandPalette.tsx` usando `cmdk` (lib).
   - Atalho global: cmd+k (mac) / ctrl+k (windows) abre overlay com input.
   - Resultado em seções:
     - **Contatos** (top 5 por relevância: nome, email, whatsapp)
     - **Empresas** (top 5: name, cnpj, domain)
     - **Deals** (top 5: title, contact name)
     - **Activities** (top 5: body match, último mês)
     - **Ações rápidas** (estáticas: "Criar contato", "Criar deal", "Ir para HojePage")
   - Click resultado → navega.
   - Search server-side: Edge Function `global-search` que faz UNION SELECT com `ilike` em colunas relevantes. Limita 25 total. Cache 60s.
   - Recent items: localStorage com últimos 5 abertos pelo user.

2. MOBILE RESPONSIVE
   - Auditar todas as telas em <768px:
     - DashboardLayout: sidebar vira drawer (hamburger menu).
     - Tables (Contacts, Companies, Deals): viram lista vertical de cards.
     - Detail pages (Contact/Company/Deal): 3 colunas → 1 coluna stacked.
     - Kanban: scroll horizontal entre colunas.
     - HojePage: já é vertical, ok.
   - Test breakpoints: 320px (small mobile), 768px (tablet), 1024px (desktop).
   - Tailwind classes: substituir layouts fixos por `flex-col md:flex-row` + `hidden md:block` + `grid-cols-1 lg:grid-cols-3`.

3. ATALHOS DE TECLADO
   - Hook `useKeyboardShortcuts.ts` global.
   - Atalhos:
     - `cmd+k`: command palette
     - `g h`: go to HojePage
     - `g c`: go to Contatos
     - `g e`: go to Empresas
     - `g d`: go to Deals
     - `n`: nova nota (no record detail aberto)
     - `c`: nova call (idem)
     - `t`: nova task (idem)
     - `?`: modal de ajuda com lista de atalhos
   - Display visual num modal "?" — `src/components/KeyboardShortcutsModal.tsx`.

4. ONBOARDING WIZARD
   - Trigger: novo user (created_at < 24h) e zero contacts.
   - Modal sequencial com 3-4 passos:
     1. Bem-vindo + breve explicação
     2. Conectar Gmail (link pra Settings) ou pular
     3. Importar contatos via CSV (modal CSV import) ou criar manualmente
     4. Fim → leva pra HojePage
   - Checkbox "não mostrar de novo".
   - Salvo em `profiles.onboarded_at`.

5. EMPTY STATES BONITOS
   - Onde hoje está texto cinza "sem dados", padronizar com `<EmptyState illustration="..." hint="..." cta="..." onCta={...} />`.
   - Aplicar em: Contacts list vazia, Companies vazia, Deals vazio, Reports sem dados, HojePage zerada.

6. DARK MODE POLISH
   - Auditar contraste em todos componentes.
   - Verifica que badges, modais, dialogs renderizam em dark mode sem contraste ruim.

7. ACCESSIBILITY (a11y) BÁSICA
   - aria-labels em ícones-only buttons.
   - keyboard nav nas listas (tab + enter).
   - focus visible.
   - color-blind safe palettes nos status badges.

CRITÉRIO DE ACEITE
- Cmd+K abre command palette de qualquer tela; achar contato em <500ms.
- Abro app no celular → todas as telas usáveis sem zoom-out manual.
- Teclado: g h navega, n abre nota, ? mostra atalhos.
- Novo user logado → wizard aparece automaticamente.
- TSC limpo. Lighthouse mobile score >70 em pelo menos 3 telas.

ENTREGÁVEIS
- `src/components/CommandPalette.tsx`.
- Edge Function `global-search`.
- `src/hooks/useKeyboardShortcuts.ts`.
- `src/components/KeyboardShortcutsModal.tsx`.
- `src/components/onboarding/OnboardingWizard.tsx`.
- `src/components/EmptyState.tsx` (reusable).
- Migration adicionando `profiles.onboarded_at`.
- Adjusts em CSS/Tailwind das telas existentes pra mobile.
- `docs/ONDA_11_DONE.md`.

REGRAS
- Command palette: lazy-load do Edge Function search (não bater banco enquanto user só abriu o palette).
- Mobile: testar em DevTools mobile emulation antes de fechar.
- Atalhos: detectar foco em <input>/<textarea> e desabilitar (não capturar enquanto user digita).
- Onboarding: modal não-modal-bloqueante (dá pra fechar com X).
- Não quebrar telas atuais. Mobile-first sem regressão desktop.
```

---

## Anti-padrões (não envie isso pra Claude Code novo)

- "Refatora tudo" — vago. Sempre escopa por phase.
- "Adiciona AI no CRM" — fora do MVP. Roadmap explícito disso.
- "Quero igual HubSpot" — não existe HubSpot inteiro em 1 prompt. Use o roadmap.
- "Conserta os bugs" sem listar quais — peça SQL/log antes.
- 2 instâncias na mesma phase — merge hell garantido.
