# Pipa Driven — CRM Roadmap

> Plano vivo. Cada onda tem critério de "pronto". Onda começa quando a anterior foi aceita.

---

## Princípios

1. **3 objetos canônicos + 1 feed**: `companies`, `contacts`, `deals`, `activities`. Tudo o mais é filtro, tag ou propriedade.
2. **"Lead" não é tabela**. É `contact.lifecycle_stage = 'lead'`. "Oportunidade" = `deal` com stage open.
3. **Timeline unificada**: toda interação (email, WhatsApp, call, note, meeting, stage change, property change, sequence step) vira linha em `activities`. Record detail lê daí.
4. **Ownership + RLS**: todo registro tem `owner_id`. Rep vê só o próprio; admin vê tudo.
5. **Cortes explícitos**: forms, landing pages, chatbot, meeting scheduler, quotes, ticketing, mobile app, workflows complexos, AI copilot — **não entram** no MVP funcional.

---

## Modelo de dados

### Objetos de negócio

- **`companies`** — organização. Campos: `id`, `name`, `domain`, `cnpj`, `industry`, `size`, `city`, `owner_id`, `lifecycle_stage`, `source`, `created_at`, `custom_props (jsonb)`.
- **`contacts`** — pessoa em uma company. Campos: `id`, `name`, `email`, `whatsapp`, `phone`, `role` (cargo), `company_id`, `owner_id`, **`lifecycle_stage`** (`subscriber\|lead\|mql\|sql\|opportunity\|customer\|evangelist\|disqualified`), `source`, `created_at`, `last_activity_at`, `custom_props`.
- **`deals`** — negociação. Campos: `id`, `title`, `value`, `currency`, `stage_id`, `pipeline_id`, `company_id`, `primary_contact_id`, `owner_id`, `expected_close`, `probability`, `source`, `created_at`, `closed_at`, `lost_reason`, `custom_props`.
- **`activities`** — evento único na timeline. Campos: `id`, `kind`, `subject`, `body`, `direction (in\|out)`, `occurred_at`, `created_by`, `contact_ids[]`, `company_id`, `deal_id`, `payload (jsonb)`. Tipos de `kind`: `note`, `email`, `call`, `meeting`, `whatsapp`, `task`, `sequence_step`, `stage_change`, `property_change`, `enrollment`.

### Suporte técnico

- `profiles` + `teams` (admin/sales/viewer)
- `pipelines` + `pipeline_stages`
- `lists` (filtros salvos)
- `properties_schema` (custom fields sem código)
- `sequences` + `sequence_steps` + `sequence_enrollments`
- `tasks`
- `message_templates`
- `email_tracking_events`

---

## Módulos da UI

| Módulo | Propósito | Status hoje |
|---|---|---|
| Contatos (list) | Ver/filtrar/segmentar | Existe, falta filtros + lists salvas |
| Empresas (list) | Ver/filtrar/segmentar | Existe, falta filtros + lists salvas |
| Deals (list + kanban) | Lista + Pipeline drag-drop | Existe, falta polish |
| Record Detail | Página única com timeline unificada | Existe mas timeline é só-WhatsApp |
| Today / Inbox | Tasks + inbound + follow-ups + sinais | Existe como HojePage, escopo a revisar |
| Sequences | Builder + execução | Existe, falta motor de execução |
| Reports | Funil, velocity, performance | Existe mas checar conteúdo |
| Settings | Users, pipelines, custom fields, templates, integrações | Fragmentado, consolidar |

### Páginas a **cortar ou fundir**
- `VendasPage`, `MarketingPage`, `IAPage` — genéricas demais; avaliar conteúdo e matar ou virar abas.
- `MensagensPage` vs `WhatsAppInbox` — uma só. Mata a duplicata.
- `CalendarPage` — esconde do menu se não está no escopo.

---

## Ondas de execução

Cada onda tem: **objetivo**, **tarefas**, **critério de aceite**. Ordem é firme até Onda 1. A partir da Onda 2, pode paralelizar.

### Onda 0 — Consolidação (1 semana)

**Objetivo**: parar a bagunça atual, destravar extensão, decidir schema canônico.

**Tarefas**:
1. Finalizar correção da extensão WhatsApp (chat_key + message_fingerprint + occurred_at na RPC; frontend volta a mostrar mensagens).
2. Arquivar migrations conflitantes (`20260419_mirror_schema.sql`, `20260419_fix_whatsapp_messages.sql`) pra pasta `archived/` com README.
3. Decidir e documentar schema canônico de `whatsapp_messages` + `whatsapp_conversations` (o que fica, o que sai). Não migrar ainda — só decidir.
4. Adicionar `lifecycle_stage` em `contacts` (enum, default `'lead'`, com migration + backfill).
5. Criar tabela `activities` com migration que consolida dados existentes (`interactions` + `whatsapp_messages` → `activities`). Dual-write a partir da RPC (insere nos dois enquanto UI migra).
6. Matar páginas redundantes (decidir quais) e remover rotas.

**Critério de aceite**:
- Extensão sincroniza chat da namorada e os N messages aparecem na timeline WhatsApp do CRM.
- `contacts` tem coluna `lifecycle_stage` preenchida em 100% das linhas.
- Tabela `activities` existe, tem todas as mensagens WhatsApp históricas, e a RPC grava lá também.
- Rotas mortas removidas do menu.

### Onda 1 — Record Detail com timeline real (1-2 semanas)

**Objetivo**: página de contato/empresa/deal com feed cronológico completo de tudo.

**Tarefas**:
1. `ContactDetail` com timeline lendo de `activities` (WhatsApp + email + call + note + task + stage/property change).
2. Quick actions: log call, add note, create task, send WhatsApp (via extensão), create deal.
3. Sidebar direita: propriedades editáveis inline (nome, email, whatsapp, role, lifecycle_stage, owner, company).
4. Sidebar esquerda: relações (empresa do contato, outros contatos da mesma empresa).
5. Aplicar mesmo tratamento em `CompanyDetail` e criar `DealDetail` se não existe.

**Critério de aceite**:
- Abro um contato e vejo email enviado, WhatsApp recebido, call logado, note adicionada, stage_change do deal dele — tudo num feed só, ordenado.
- Posso editar qualquer propriedade inline sem abrir modal.
- Quick actions criam `activity` corretamente.

### Onda 2 — Lists robustas (1 semana) — **paralelizável com Onda 3/4**

**Objetivo**: list view que reps confiam pra encontrar qualquer coisa.

**Tarefas**:
1. Tabela virtualizada (10k+ rows sem lag).
2. Colunas configuráveis (user escolhe quais mostrar, salva preferência).
3. Filtros avançados (AND/OR, operadores `is/contains/greater/less/between`).
4. Salvar filtro atual como "Lista" nomeada; menu de listas salvas.
5. Busca por texto livre (nome/email/phone/company).
6. Bulk actions: atribuir owner, adicionar a sequence, exportar CSV, deletar.
7. Importar CSV com mapeamento de colunas + dedup por email/phone.

**Critério de aceite**:
- 10k contatos filtrados em <500ms.
- Lista salva reabre com mesmo resultado.
- CSV de 5k linhas importa sem duplicar.

### Onda 3 — Pipeline Kanban polido (1 semana) — **paralelizável com Onda 2/4**

**Objetivo**: Kanban que funciona como Pipedrive.

**Tarefas**:
1. Drag-drop entre stages com optimistic update.
2. Soma de valor por coluna no topo.
3. Card mostra: título, valor, dias em stage, foto do owner.
4. Filtros: owner, source, data.
5. Clique abre record detail.
6. Stage change gera `activity` automaticamente.

**Critério de aceite**:
- Arrasto deal entre stages, timeline do deal mostra o `stage_change`.
- Soma do topo bate com soma manual dos cards.

### Onda 4 — Today / Inbox (1 semana) — **paralelizável com Onda 2/3**

**Objetivo**: rep abre o CRM de manhã e sabe exatamente o que fazer.

**Tarefas**:
1. Seções verticais: Tasks atrasadas → Tasks de hoje → Inbound sem resposta → Follow-ups de cadência do dia → Sinais quentes (ABM).
2. Cada item tem ação de 1 clique (marcar feito, responder, reagendar).
3. Badge no sidebar com contador total.
4. Quando marco feito, some imediatamente.

**Critério de aceite**:
- Uma lista vertical, sem aba, sem clique extra, 100% acionável.

### Onda 5 — Sequences funcionais (2 semanas)

**Objetivo**: cadência automática que efetivamente envia.

**Tarefas**:
1. Builder visual de sequence: nome, canal (whatsapp/email/ambos), steps (delay + template).
2. Worker (Edge Function no cron) que processa enrollments ativos, respeita horário comercial.
3. Unenroll automático quando contato responde (trigger na RPC de ingest).
4. Status por enrollment: active / paused / completed / unenrolled / errored.
5. Steps aparecem na timeline do contato como `activity kind='sequence_step'`.

**Critério de aceite**:
- Enrollo 10 contatos numa sequence de 3 steps, 1/dia. No dia 3, todos receberam os 3 (menos os que responderam).

### Onda 6 — Reports mínimos (1 semana)

**Objetivo**: dashboard que diretor olha uma vez por semana.

**Tarefas**:
1. Funil: # entraram/saíram em cada stage, conversão %.
2. Velocity: tempo médio em cada stage.
3. Performance: # deals fechados por owner/mês, valor fechado.
4. Atividade: # msgs/calls/notes por owner/dia.

**Critério de aceite**:
- 4 números certos na home de Reports, com filtro de data.

### Onda 7 — Settings no-code (1 semana)

**Objetivo**: admin muda coisas sem precisar de dev.

**Tarefas**:
1. Gerenciar usuários + roles (admin/sales/viewer).
2. Configurar pipelines + stages + probabilidade default.
3. Adicionar custom field (text/number/date/enum).
4. Cadastrar message templates (WhatsApp + email).
5. Integrações: WhatsApp (extensão), Email (Gmail/Outlook OAuth), Apollo, N8N.

**Critério de aceite**:
- Admin adiciona custom field e ele aparece em list + detail + importação CSV sem restart.

---

## O que fica fora do MVP (explícito)

Pra não confundir — não entram nas Ondas 0-7:
- Forms / landing pages
- Chat web / chatbot
- Meeting scheduler (usar Cal.com linkado)
- Quotes / documents / e-signature
- Ticketing / suporte
- Mobile app nativo
- Workflows complexos (triggers multi-etapa)
- AI copilot / summarização / predictive scoring
- Ad management
- SSO / SCIM

Esses entram em roadmap pós-MVP.

---

## Estimativa total

9-10 semanas pra CRM comparável a **HubSpot Starter** ou **Pipedrive Essential**.
Depois disso, começa Onda 8+ (automação/AI).

---

## Status

- [x] Onda 0 — Consolidação (ver [ONDA_0_DONE.md](./ONDA_0_DONE.md))
- [x] Onda 1 — Record Detail com timeline (ver [PHASE_1G_DONE.md](./PHASE_1G_DONE.md))
  - [x] Phase 1A — `ConversationView` (bolhas WhatsApp) + toggle Conversa/Auditoria no `WhatsAppTimeline`
  - [x] Phase 1A.2 — captura de media real do WhatsApp (Storage + metadata + render de audio/imagem/video/documento/sticker)
  - [x] Phase 1B — `ActivityTimeline` unificado (ver [PHASE_1B_DONE.md](./PHASE_1B_DONE.md))
  - [x] Phase 1C — `ContactDetail` overhaul (timeline unificada + conversation tab + sidebar de props) (ver [PHASE_1C_DONE.md](./PHASE_1C_DONE.md))
  - [x] Phase 1D — `CompanyDetail` overhaul (mesmo tratamento) (ver [PHASE_1D_DONE.md](./PHASE_1D_DONE.md))
  - [x] Phase 1E — `DealDetail` (criar se não existe) (ver [PHASE_1E_DONE.md](./PHASE_1E_DONE.md))
  - [x] Phase 1F — Quick actions (LogCallModal + CreateTaskModal + DealForm wired; TaskItem persiste status) (ver [PHASE_1F_DONE.md](./PHASE_1F_DONE.md))
  - [x] Phase 1G — Property inline edit (ver [PHASE_1G_DONE.md](./PHASE_1G_DONE.md))
- [x] Onda 2 — Lists robustas (ver [ONDA_2_DONE.md](./ONDA_2_DONE.md))
- [x] Onda 3 — Pipeline Kanban (ver [ONDA_3_DONE.md](./ONDA_3_DONE.md))
- [x] Onda 4 — Today / Inbox (ver [ONDA_4_DONE.md](./ONDA_4_DONE.md))
- [x] Onda 5 — Sequences (ver [ONDA_5_DONE.md](./ONDA_5_DONE.md))
- [x] Onda 6 — Reports (ver [ONDA_6_DONE.md](./ONDA_6_DONE.md))
- [x] Onda 7 — Settings no-code (ver [ONDA_7_DONE.md](./ONDA_7_DONE.md))

- [x] **Onda 8 — Sequences Apollo-style** (ver [ONDA_8_DONE.md](./ONDA_8_DONE.md))
- [x] **Onda 9 — Email integration real** (ver [ONDA_9_DONE.md](./ONDA_9_DONE.md))
- [x] **Onda 10 — Notifications + Mentions** (ver [ONDA_10_DONE.md](./ONDA_10_DONE.md))
- [x] **Onda 11 — Global Search + Polish** (ver [ONDA_11_DONE.md](./ONDA_11_DONE.md))
