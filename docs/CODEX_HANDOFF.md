# Codex — Handoff do CRM Pipa Driven

> **Autorizado pelo Renan Zanato a revisar bugs e seguir a execução do roadmap.** Este documento substitui conversa prévia. Leia antes de agir.

---

## 1. Snapshot em 30 segundos

- **Produto**: CRM B2B próprio, stack React + Supabase, com extensão Chrome pra capturar WhatsApp Web.
- **Onde estamos**: Onda 0 + Phase 1A + 1A.2 + 1B + 1C + 1D + 1E **concluídas e verificadas localmente**.
- **Próximo**: Phase 1F (quick action modais) ou Phase 1G (inline edit). Ver §5.
- **Roadmap canônico**: [`docs/CRM_ROADMAP.md`](./CRM_ROADMAP.md). **É a fonte de verdade** — atualize o status lá quando entregar.
- **Autor anterior**: Claude (sessão com bandwidth limitado). Esta passagem foi por esgotamento de tokens, não por entrega mal feita.

---

## 2. O que você precisa ler primeiro

Em ordem:

1. [`docs/CRM_ROADMAP.md`](./CRM_ROADMAP.md) — ondas 0-7, modelo de dados, critérios de aceite.
2. [`docs/ONDA_0_DONE.md`](./ONDA_0_DONE.md) — o que foi feito na Onda 0 e como testar.
3. [`supabase/migrations/20260424_fix_whatsapp_ingest_chat_key.sql`](../supabase/migrations/20260424_fix_whatsapp_ingest_chat_key.sql) — RPC atual `public.ingest_whatsapp_chat`, dual-write em `activities`.
4. [`supabase/migrations/20260424_activities_table.sql`](../supabase/migrations/20260424_activities_table.sql) — tabela unificada de timeline.
5. [`supabase/migrations/20260424_contact_lifecycle_stage.sql`](../supabase/migrations/20260424_contact_lifecycle_stage.sql) — enum `lifecycle_stage`.
6. [`src/components/whatsapp/ConversationView.tsx`](../src/components/whatsapp/ConversationView.tsx) — bolhas recém-criadas.
7. [`src/components/crm/WhatsAppTimeline.tsx`](../src/components/crm/WhatsAppTimeline.tsx) — consumidor das bolhas, tem toggle Conversa/Auditoria.
8. [`extension/inject-wa.js`](../extension/inject-wa.js), [`extension/content_script.js`](../extension/content_script.js), [`extension/background.js`](../extension/background.js) — pipeline de captura.

**Não abra** `supabase/archived/` nem `src/_archived/`. São histórico.

---

## 3. Decisões arquiteturais já fechadas (não re-litigar)

1. **3 objetos canônicos + 1 feed**: `companies`, `contacts`, `deals`, `activities`. "Lead" não é tabela, é `contact.lifecycle_stage='lead'`.
2. **Schema canônico = `RODAR_TUDO.sql` + migrations em `migrations/`**. Os migrations em `archived/` são lixo.
3. **Dual-write em `activities`**: a RPC `ingest_whatsapp_chat` grava em `whatsapp_messages` (canal específico) **e** em `activities` (timeline unificada). Novas UIs devem ler de `activities`.
4. **Sem backfill retroativo de `activities`**: só forward. Se precisar popular histórico, **pedir autorização ao Renan**.
5. **`MensagensPage` usa `WhatsAppTimeline`**, que agora tem modo "Conversa" (bubbles) e "Auditoria" (cards técnicos). Default Conversa.
6. **Páginas arquivadas** (não reanimar sem conversa): `VendasPage`, `MarketingPage`, `IAPage`, `MetricasPage`, `CalendarPage`, `whatsapp/WhatsAppInbox`, `whatsapp/DealWhatsAppTab`.
7. **Supabase URL + anon key** hardcoded em [`extension/background.js`](../extension/background.js). Não mover pra env vars nesta fase — extensões MV3 não têm `process.env` trivial.

---

## 4. Bugs e riscos pra revisar

Antes de começar trabalho novo, passa os olhos nisso.

### 4.1. Legacy data com `direction` em formato antigo
- `normalizeDirection` em [`WhatsAppTimeline.tsx:279`](../src/components/crm/WhatsAppTimeline.tsx#L279) aceita `'out'` / `'outbound'` / `'sent'` / `'saida'` / `'from_me'` / `'true'` → outbound; resto → inbound.
- **Risco**: se tiver outro valor em algum chat legacy, vira inbound incorretamente. Teste: `SELECT direction, count(*) FROM whatsapp_messages GROUP BY 1`. Se aparecer algo fora dos aceitos, adicionar.

### 4.2. Chats sem `chat_key` ainda
- A migration 20260424 backfilla, mas se tiver linha inserida depois por outro caminho (ex.: teste manual via SQL), pode estar sem.
- Teste: `SELECT count(*) FROM whatsapp_conversations WHERE chat_key IS NULL`. Se > 0, investigar origem.

### 4.3. `activities` está recebendo duplicatas?
- Existe `CREATE UNIQUE INDEX activities_whatsapp_msg_unique ON public.activities ((payload->>'wa_message_id')) WHERE kind = 'whatsapp' AND payload ? 'wa_message_id';` com `ON CONFLICT DO NOTHING` na RPC.
- Teste: `SELECT payload->>'wa_message_id', count(*) FROM activities WHERE kind='whatsapp' GROUP BY 1 HAVING count(*) > 1`. Esperado: zero linhas.

### 4.4. RLS de `activities` pode bloquear leitura legítima
- Policy lê se o usuário é owner do contact/company/deal referenciado. Se o `contact_id` na activity estiver apontando pra um contato cujo `owner_id` é outro user, ele não vê.
- **Cenário frágil**: bulk transfer de contatos entre owners — activities não reatualizam.
- Aceita por enquanto (MVP).

### 4.5. Extensão: race condition na fila
- [`content_script.js:scanVisibleMessages`](../extension/content_script.js) faz `splice(0)` antes de processar. Se `syncMessage` falhar (service worker morreu), a mensagem some da fila. Só `rememberProcessedMessage` em sucesso — se processar metade e der timeout, as primeiras foram marcadas processadas e as últimas não.
- **Fix sugerido**: mover splice pra DEPOIS do sucesso, ou usar IndexedDB como fila persistente (fase posterior).

### 4.6. Service worker da extensão pode dormir no MV3
- Chrome pode matar o service worker após 30s ociosos. Em sessão longa isso causa mensagens perdidas entre "morreu" e "próximo evento acorda".
- Considerar `chrome.alarms` pra manter vivo, ou aceitar retry no próximo reload.

### 4.7. `ConversationView` não virtualiza
- 500 mensagens renderizam OK. 5000+ vai engasgar. Usar `react-virtuoso` ou `@tanstack/react-virtual` quando necessário.

### 4.8. Timezone nos `occurred_at`
- Banco usa `timestamptz`. Frontend usa `new Date(value)`. Deve estar OK, mas se aparecer mensagem com data "Sem data" quando deveria ter, investigar parse.

---

## 5. Trabalho pra fazer, em ordem

### ✅ Phase 1A.2 — Captura de media real (concluída)

Entregue por Codex. Ver [PHASE_1A_2_DONE.md](./PHASE_1A_2_DONE.md).

**Estado atual:**
- Extensão baixa media via `WPP.chat.downloadMedia(msg)` e sobe pro bucket `whatsapp-media`.
- Path determinístico `{owner_id}/{chat_key}/{wa_message_id}.{ext}`.
- RPC `ingest_whatsapp_chat` grava `media_url`, `media_mime`, `media_size`, `media_bucket`, `media_path`, `media_filename`, `media_download_error` em `whatsapp_messages.metadata` e `activities.payload`.
- Se mensagem existia sem media, RPC atualiza retroativamente via `wa_message_id`.
- `ConversationView` renderiza `<audio>`, `<img>`, `<video>`, `<a download>` reais.

**Limites conhecidos (tech debt, não bloqueiam 1B)**:
- 🔴 **Bucket público**: URLs completas viráveis = download direto. Mitigar com signed URLs se vazar privacidade.
- 🟡 **Media > 25 MB**: não é baixada (limite do chrome.runtime messaging). Fica com `media_download_error`.
- 🟡 **Fila da extensão ainda em memória**: se service worker morrer no meio, retry fica na fila mas reinício da extensão apaga. IndexedDB persistence ainda é backlog.

**Lições pro próximo**:
- Ao ler `activities`, use `payload->>'media_url'` pra mídia, não coluna física.
- `payload.message_type` tem o tipo real (audio/image/video/document/sticker/text) — filtrar por isso se precisar.
- Dual-write (whatsapp_messages + activities) tá estável. Outras phases podem seguir esse padrão.

---

### ✅ Phase 1B — ActivityTimeline unificada (concluída)

Entregue. Ver [PHASE_1B_DONE.md](./PHASE_1B_DONE.md).

- `src/services/activitiesService.ts` com `getActivitiesFor{Contact|Company|Deal}`.
- `src/components/activities/ActivityTimeline.tsx` + `TimelineItems.tsx`.
- 10 kinds mapeados (note/whatsapp/email/call/meeting/task/stage_change/property_change/sequence_step/enrollment) + fallback UnknownItem.
- Chips de filtro multi-select, agrupamento por dia, polling 30s configurável.

---

### ⚠️ Phase 1B (especificação original — já entregue, mantida aqui só como histórico)

Construir o feed unificado que `ContactDetail` / `CompanyDetail` / `DealDetail` vão consumir. Sem isso, 1C/1D/1E não andam.

**Arquivos a criar**:
- `src/services/activitiesService.ts` — funções `getActivitiesForContact(contactId)`, `getActivitiesForCompany(companyId)`, `getActivitiesForDeal(dealId)`. Cada uma usa Supabase client, seleciona colunas relevantes da tabela `activities`, ordena por `occurred_at desc`, com limite de 200 (paginar depois).
- `src/components/activities/ActivityTimeline.tsx` — componente React que recebe `{ contactId? | companyId? | dealId? }` e renderiza o feed.
- `src/components/activities/items/` — subpasta com um componente por kind: `NoteItem`, `WhatsAppItem`, `EmailItem`, `CallItem`, `MeetingItem`, `TaskItem`, `StageChangeItem`, `PropertyChangeItem`, `SequenceStepItem`, `EnrollmentItem`.

**Props do `ActivityTimeline`**:
```ts
interface Props {
  contactId?: string;
  companyId?: string;
  dealId?: string;
  kindFilter?: ActivityKind[]; // opcional, default = todos
  emptyHint?: string;          // texto quando vazio
}
```

**Comportamento**:
- `useQuery` com `queryKey: ['activities', scope, id]`, polling 30s.
- Ordenação cronológica reversa (mais recente no topo).
- Divisores de dia (reusar `DayDivider` do `ConversationView` ou extrair pra `src/lib/timeAgo.ts`).
- Filtro client-side por kind via chips no header do componente.

**Renderização por kind** (cada item tem header com ícone + kind + hora + autor):
- `note` — card com body multilinha. Lucide: `StickyNote`.
- `whatsapp` — usa `ConversationView` com apenas essa mensagem, **passando `payload.media_url`, `payload.media_mime`, `payload.media_name` pra renderizar media**. Lucide: `MessageCircle`. Se tiver muitas mensagens WA consecutivas da mesma conversa, agrupar num único item expansível ("12 mensagens via WhatsApp").
- `email` — subject + preview (primeiras 2 linhas). Lucide: `Mail`.
- `call` — duração + resultado (`completed`/`no_answer`/`busy`). Lucide: `Phone`.
- `meeting` — título + horário + link. Lucide: `Calendar`.
- `task` — checkbox (toggle done) + título + due date. Lucide: `CircleCheck`.
- `stage_change` — "Deal **X** moveu de **Stage A** → **Stage B**". Lucide: `ArrowRight`.
- `property_change` — "**Campo**: valor antigo → valor novo". Lucide: `PenLine`. Ler de `payload.field`, `payload.old`, `payload.new`.
- `sequence_step` — "Passo N da sequence **Y** enviado via **canal**". Lucide: `Workflow`.
- `enrollment` — "Enrolled em **Sequence Y**". Lucide: `UserPlus`.

**Reading media** (lição da Phase 1A.2):
- Media URL vem de `activity.payload.media_url`. Não assumir coluna física.
- Se `payload.media_download_error` estiver setado, mostrar badge "media não baixou" discreto.

**Critério de aceite**:
- Abrir Supabase e rodar `SELECT count(*) FROM activities` retorna N>0.
- Contato com 20 activities renderiza tudo em ordem, <500ms.
- Filtro `kindFilter=['whatsapp']` mostra só as mensagens; passa pro `ConversationView` com media renderizada.
- Nenhum kind conhecido cai no fallback "tipo não reconhecido".

**Fora do escopo** (fase 1F/1G): criar novas activities, inline edit de notes.

### Phase 1C — ContactDetail overhaul (2 dias) — **prioridade agora**

Reescrever [`src/pages/crm/ContactDetail.tsx`](../src/pages/crm/ContactDetail.tsx) com layout de 3 colunas, plugando o componente novo `ActivityTimeline` já pronto na Phase 1B.

**Layout alvo** (desktop ≥ 1024px; em mobile, cola tudo em coluna única com sidebars colapsáveis):

```
┌────────────────────────────────────────────────────────────────┐
│ Header: avatar + nome + lifecycle_stage + email + whatsapp +   │
│         owner + quick actions (Note / Call / Task / WA / Deal) │
├──────────┬──────────────────────────────┬──────────────────────┤
│          │                              │                      │
│ Sidebar  │   ActivityTimeline           │  Sidebar             │
│ Relações │   (centralizada)             │  Propriedades        │
│          │                              │                      │
│ - Empresa│   + Tab "Conversa WhatsApp" │  (read-only em 1C;   │
│ - Deals  │     (bubbles do contato)     │   inline edit em 1G) │
│ - Outros │                              │                      │
│   contac-│                              │                      │
│   tos    │                              │                      │
│   da co. │                              │                      │
│          │                              │                      │
└──────────┴──────────────────────────────┴──────────────────────┘
```

**Arquivos**:
- Reescreve: [`src/pages/crm/ContactDetail.tsx`](../src/pages/crm/ContactDetail.tsx) (já tem 466 linhas com phone reveal, ContactForm edit, formato atual; **preservar** essas funcionalidades reaproveitando os handlers existentes — não jogar fora).
- **Usar, não reescrever**:
  - `<ActivityTimeline contactId={id} />` — componente principal da timeline.
  - `<ConversationView messages={...} />` — usar numa aba dedicada "Conversa WhatsApp" se quiser isolar.
  - `ContactForm` existente — manter pro botão "Editar" enquanto 1G não chega.

**Quick actions no header** (botões, não modais ainda — cada botão abre modal placeholder "Em breve" ou reaproveita fluxo existente):
- **Add note** — em 1C pode abrir um `<textarea>` inline simples que cria `activity kind='note'` via `INSERT INTO activities`. Isso adianta valor antes do modal fancy da Phase 1F.
- **Log call** — em 1C: abrir placeholder toast "disponível na próxima fase".
- **Create task** — idem.
- **Send WhatsApp** — se `contact.whatsapp` existir, abre `https://wa.me/{digits}` em nova aba.
- **Create deal** — placeholder "disponível na próxima fase".

**Critério de aceite**:
- Abro `/crm/contatos/:id` → vejo header + 3 colunas.
- Timeline central mostra atividades reais via `ActivityTimeline`.
- Sidebar esquerda mostra: empresa do contato (nome + buying_signal), lista de deals dele (título + stage + valor), outros contatos da mesma empresa (nome + role).
- Sidebar direita mostra read-only: nome, email, whatsapp, phone, role, company, lifecycle_stage, owner, source, created_at.
- Quick action "Add note" grava activity e timeline atualiza em <2s.
- Quick action "Send WhatsApp" abre wa.me.
- TSC limpo.

**Fora do escopo** (ficam pra 1F/1G):
- Modais de call/task/deal (agora só toast "em breve").
- Inline edit das propriedades (read-only por ora).
- Bulk actions, merge/dedupe de contatos.

### ✅ Phase 1D — CompanyDetail overhaul (concluída)

Entregue. Ver [PHASE_1D_DONE.md](./PHASE_1D_DONE.md).

**Estado atual:**
- `CompanyDetail` usa layout de 3 colunas.
- Sidebar esquerda lista contatos e deals da empresa.
- Centro tem abas Timeline, Lançamentos, Sinais, Cadência, Conversa WhatsApp e Interações legacy.
- Sidebar direita mostra propriedades e links read-only.
- Add note cria `activities.kind='note'` com `company_id`.
- `ActivityTimeline` usa `ActivitySkeleton` e `ActivityEmptyState`.

### ⚠️ Phase 1D (especificação original — já entregue, mantida aqui só como histórico)

**Arquivo**: [`src/pages/crm/CompanyDetail.tsx`](../src/pages/crm/CompanyDetail.tsx).

**Layout alvo** — mesmo padrão de 3 colunas que 1C, mas respeitando o conteúdo rico que já existe:

```
┌────────────────────────────────────────────────────────────────┐
│ Header: nome da empresa + buying_signal badge + lifecycle_stage │
│         + owner + quick actions (Add note / Add contact / Link  │
│         deal / Start cadence)                                   │
├──────────┬──────────────────────────────┬──────────────────────┤
│          │                              │                      │
│ Sidebar  │   Tabs:                      │  Sidebar             │
│ Relações │   • Timeline (ActivityTime-  │  Propriedades        │
│          │     line companyId={id})     │  (read-only em 1D;   │
│ - Conta- │   • Launches (EXISTENTE)    │   inline edit em 1G) │
│   tos da │   • Signals (EXISTENTE)     │                      │
│   empresa│   • Conversa WA (opcional:  │  - domain            │
│ - Deals  │     WhatsAppTimeline         │  - cnpj              │
│   desta  │     companyId={id})          │  - city              │
│   conta  │                              │  - industry          │
│          │                              │  - size              │
│          │                              │  - vgv_projected     │
│          │                              │  - buying_signal     │
│          │                              │  - icp_score         │
│          │                              │  - cadence_status    │
│          │                              │  - created_at        │
└──────────┴──────────────────────────────┴──────────────────────┘
```

**O que ADICIONAR**:
1. Nova aba "**Timeline**" (primeira da lista, default) com `<ActivityTimeline companyId={id} />`.
2. Sidebar esquerda com 2 seções colapsáveis:
   - **Contatos** — query `contacts` onde `company_id = id`. Mostra nome + role + whatsapp. Clique navega pra `/crm/contatos/:contactId`.
   - **Deals** — query `deals` onde `company_id = id`. Mostra title + stage + valor. Clique navega pra `/crm/negocios/:dealId`.
3. Sidebar direita (read-only em 1D) com as propriedades da company. Mostrar `lifecycle_stage` com badge colorido. Usar `fmtVGV` e `fmtDate` que já existem no arquivo.

**O que PRESERVAR** (não tocar ou só ajustar posição):
- Tabs Launches e Signals inteiras.
- `SignalManager`, `LaunchForm`, `LaunchCard` — não mexer.
- `WhatsAppTimeline` embedada — pode virar aba "Conversa WA" dentro do grupo de tabs, ou ficar embaixo. Escolha que preserve valor.
- Toda a lógica de `getCompanyCadenceDay`, `startCadenceForContacts`, etc.

**Quick actions do header**:
- **Add note** — mesma abordagem pragmática da Phase 1C: textarea inline → `INSERT INTO activities(kind='note', company_id=id, body=...)`. Reusa `createNoteActivity` que Codex já adicionou em [`activitiesService.ts:146`](../src/services/activitiesService.ts#L146) passando `companyId` em vez de `contactId`.
- **Add contact** — abre `<ContactForm>` pré-preenchido com `company_id=id` (já tem o componente).
- **Link deal** — placeholder ("em breve").
- **Start cadence** — reaproveitar `startCadenceForContacts` existente se fizer sentido.

**Critério de aceite**:
- Abro `/crm/empresas/:id` → vejo header + 3 colunas.
- Tab Timeline funciona e mostra atividades reais da company (mínimo: WhatsApp populadas pela extensão).
- Tabs Launches e Signals continuam funcionando idênticas (nenhum dado perdido).
- Sidebar esquerda lista contatos e deals com link funcional.
- Quick action "Add note" persiste activity com `company_id = id`.
- TSC limpo.

**Fora do escopo** (1F/1G):
- Modal fancy de call/task/deal.
- Inline edit.
- Reordenação de tabs ou refactor grande do layout de Launches/Signals.

### ✅ Phase 1E — DealDetail (concluída)

Entregue. Ver [PHASE_1E_DONE.md](./PHASE_1E_DONE.md).

**Estado atual:**
- Nova página [`src/pages/crm/DealDetail.tsx`](../src/pages/crm/DealDetail.tsx).
- Rota `/crm/negocios/:id`.
- Header com stage, valor, data prevista, empresa e contato.
- Timeline central filtrada por `deal_id`.
- Add note cria `activities.kind='note'` com `deal_id`.
- Move stage atualiza `deals.stage` e cria `activities.kind='stage_change'`.
- `PipelinePage` abre o detalhe ao clicar no título do deal.

### ⚠️ Phase 1E (especificação original — já entregue, mantida aqui só como histórico)

Não existe ainda. Criar `src/pages/crm/DealDetail.tsx`. Rota `/crm/negocios/:id`. Layout similar aos outros Detail. Timeline filtrada por `deal_id`. Header mostra stage + valor + close date. Ação "Move stage" gera `activity kind='stage_change'`.

### Phase 1F — Quick actions modais (2 dias)

Modais acessíveis do header dos Detail pages:
- **Add note**: textarea → INSERT em `activities kind='note'` ligado ao contact/company/deal.
- **Log call**: form com duração, resultado (completed/no-answer/busy), notes → INSERT em `activities kind='call'`.
- **Create task**: form com título, due_date, assignee → INSERT em `tasks` (criar tabela se não existe) + mirror em `activities kind='task'`.
- **Send WhatsApp**: abre a extensão com número pré-preenchido (via `chrome.runtime.sendMessage` para a extensão ou `wa.me/` link).
- **Create deal**: form com title, value, stage (pre-select primeira do funil) → INSERT em `deals`.

**Critério de aceite**: cada ação gera activity, fecha modal, timeline atualiza em <1s.

### Phase 1G — Property inline edit (2 dias)

Componente `<InlineEdit field="..." value="..." onSave={...} />` que:
- Mostra valor como texto normal
- Clica → vira input
- Enter ou blur → salva
- Valida tipo (text/number/date/enum)
- Optimistic update via react-query
- Gera `activity kind='property_change'` automaticamente

Usar em sidebar de ContactDetail/CompanyDetail/DealDetail.

---

## 6. Regras de engajamento

### Código

- **Arquivos relativos a** `seamless-crm-suite/`.
- **Lint/type check obrigatório**:
  - `cd seamless-crm-suite && npx tsc --noEmit` deve passar.
  - `cd seamless-crm-suite && node --check extension/*.js extension/lib/*.js` deve passar.
- **Nunca deletar**: mover pra `_archived/` ou `archived/` + README explicando.
- **Nunca bypassar git hooks** (`--no-verify`, `--no-gpg-sign`).
- **Commits pequenos e focados**: um commit por phase/feature, mensagem explícita.

### Supabase

- **Idempotência obrigatória** em migrations: `CREATE ... IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, `DO $$ EXCEPTION WHEN undefined_column THEN NULL`.
- **Não DROP table/column sem migração explícita e autorização**.
- **RLS em toda tabela nova**. Policy de default: `auth.uid() IS NOT NULL` pra INSERT, ownership-based pra SELECT.
- **Nome do migration**: `YYYYMMDD_verbo_objeto.sql`, snake_case, descritivo.

### Extensão

- `node --check` em todo JS antes de mandar.
- Preservar retrocompatibilidade do payload da RPC (aceitar ambos `wa_msg_id` e `raw_id` como chave única).
- Não enviar dados sensíveis em logs (`console.log` com `chat_jid` ou conteúdo).

### Comunicação com o Renan

- **Antes de começar uma phase**: confirma no chat que vai pegar. Evita sobreposição.
- **Ao entregar**: escrever um `docs/PHASE_{N}_DONE.md` (no padrão do `ONDA_0_DONE.md`) com o que rodar, como testar, critérios de aceite checkados.
- **Perguntar antes de**:
  - Backfill retroativo de qualquer tabela
  - Criar tabela nova (não prevista no roadmap)
  - Modificar schema de `RODAR_TUDO.sql` (imutável em tese)
  - Mexer em `docs/CRM_ROADMAP.md` além do status
  - Qualquer coisa que afete produção direto

---

## 7. Testing protocol

### Local

1. `cd seamless-crm-suite && npm install && npm run dev`
2. Abrir http://localhost:5173
3. Login com credenciais do Supabase (Renan tem admin).

### Extensão

1. `chrome://extensions/` → Developer mode → Load unpacked → apontar pra `seamless-crm-suite/extension/`.
2. Reload após qualquer mudança em `extension/*`.
3. Abrir `https://web.whatsapp.com/` após login na extensão.
4. Console do DevTools em web.whatsapp.com mostra logs prefix `[Pipa]`.

### Supabase

- Rodar migrations novas na ordem alfabética via SQL Editor do Supabase Studio.
- Todas são idempotentes — rodar duas vezes não deve quebrar nada.

### Observabilidade

- Popup da extensão mostra stats (sincronizadas, ignoradas, falhas) + último erro.
- `SELECT * FROM activities ORDER BY occurred_at DESC LIMIT 20` pra checar ingestão.

---

## 8. Paradas rápidas

### "Não sei o que o Renan quer"

Padrão: entrega o **caminho feliz** primeiro. Sem telas de confirmação, modais fancy, ou over-engineering. Ele usa, dá feedback, iteramos.

### "Achei um bug não listado"

Adiciona no §4 deste doc + menciona no PR. Se for bloqueador, avisa o Renan antes de continuar.

### "A phase ficou muito grande"

Parte em sub-phases (ex.: 1C.1 = header, 1C.2 = sidebars, 1C.3 = tabs). Cada sub entregável + reviewable.

### "Vou precisar de dado de produção"

Pergunta antes. O Renan tem dados reais (mensagens da namorada, leads de verdade). Não dumpar, não copiar fora do Supabase sem consentimento.

---

## 9. Contato e autorização

Este handoff está autorizado pelo **Renan Zanato** a partir da data de geração do documento. Pode:

- [x] Ler todo o código do repo
- [x] Executar migrations novas no Supabase (via SQL Editor)
- [x] Modificar qualquer arquivo fora de `_archived/` e `archived/`
- [x] Commitar e pedir review via PR
- [x] Arquivar código morto (mover pra `_archived/`)
- [ ] Deletar arquivos permanentemente (pedir antes)
- [ ] Alterar secrets/API keys (pedir antes)
- [ ] Rodar DROP em produção (pedir antes)
- [ ] Fazer deploy pra produção (pedir antes)

---

**Boa sorte. Mantém o roadmap vivo e o Renan informado.**
