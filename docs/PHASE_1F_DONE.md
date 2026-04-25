# Phase 1F — Quick actions modais

Os botões de "Call", "Task" e "Deal" no header dos record details (Contact / Company / Deal) deixam de ser placeholders e passam a abrir modais reais que persistem em `public.activities`. Toggle de tarefa concluída também funciona end-to-end.

---

## O que foi feito

### 1. Service layer: 4 novos helpers

[`src/services/activitiesService.ts`](../src/services/activitiesService.ts):

- `createCallActivity({ contactId?, companyId?, dealId?, direction, durationSeconds, outcome, body, occurredAt? })` — INSERT em `activities` com `kind='call'`, payload contém `duration_seconds` e `outcome`.
- `createTaskActivity({ contactId?, companyId?, dealId?, title, body?, dueDate?, assigneeId? })` — INSERT em `activities` com `kind='task'`, payload contém `due_date`, `status='pending'`.
- `createMeetingActivity(...)` — pronto pra uso futuro (botão "Meeting" não plugado ainda, fica pra evolução).
- `setTaskStatus(activityId, status)` — atualiza `payload.status` preservando o resto do payload.

### 2. Modais reutilizáveis

- [`src/components/activities/LogCallModal.tsx`](../src/components/activities/LogCallModal.tsx) — Dialog com campos: direção (eu liguei / recebi), resultado (conversou / não atendeu / caixa postal / ocupado / errado), duração (s), anotação. Salva via `createCallActivity` + invalida queries.
- [`src/components/activities/CreateTaskModal.tsx`](../src/components/activities/CreateTaskModal.tsx) — Dialog com campos: título (autofocus), vence em (date input, default = hoje), detalhes opcionais. Salva via `createTaskActivity`.

Ambos aceitam `{ open, onOpenChange, contactId?, companyId?, dealId?, createdBy?, invalidateKey? }` — pluggable em qualquer record detail.

### 3. Wiring nos record details

- [`src/pages/crm/ContactDetail.tsx`](../src/pages/crm/ContactDetail.tsx): botões `Call`, `Task` e `Deal` no header agora abrem modais respectivos (LogCallModal, CreateTaskModal, DealForm com `defaultCompanyId`). Removeu o helper `phase1FPlaceholder`.
- [`src/pages/crm/CompanyDetail.tsx`](../src/pages/crm/CompanyDetail.tsx): adicionados botões `Call` e `Task` no header (já tinha `Nota` e `Deal`).
- [`src/pages/crm/DealDetail.tsx`](../src/pages/crm/DealDetail.tsx): adicionados `Call` e `Task` no header. Os modais já incluem `dealId` no payload, então a activity aparece no feed do deal e também na timeline do contato/empresa relacionados.

Padrão de `invalidateKey`:
- ContactDetail: `['activities', 'contact', contact.id]`
- CompanyDetail: `['activities', 'company', company.id]`
- DealDetail: `['activities', 'deal', deal.id]`

Bate com a chave que o `ActivityTimeline` usa, então o feed atualiza imediatamente.

### 4. TaskItem checkbox persistente

[`src/components/activities/TimelineItems.tsx`](../src/components/activities/TimelineItems.tsx) — `TaskItem` agora:
- Faz mutation otimista via `setTaskStatus` ao toggle.
- Em erro, faz rollback do estado visual + toast.
- Em sucesso, invalida `['activities']` pra refletir em todas as timelines abertas.
- Checkbox fica disabled durante o request pra evitar double-click.

---

## O que rodar no Supabase

**Nada.** Phase 1F é só frontend + insert em `activities` (tabela já existe desde a Onda 0).

---

## Como testar

### Teste 1 — Log call

1. Abrir `/crm/contatos/<id>`.
2. Clicar `Call` no header → modal abre.
3. Preencher direção/resultado/duração, salvar.
4. Timeline central mostra um item `kind='call'` com ícone roxo, autor, hora.
5. SQL de verificação:
   ```sql
   select kind, subject, payload->>'duration_seconds' as dur, payload->>'outcome' as outcome
     from public.activities
    where contact_id = '<id>' and kind = 'call'
    order by occurred_at desc limit 5;
   ```

### Teste 2 — Create task + toggle

1. Mesmo contato → clicar `Task` → preencher título + due date → salvar.
2. Timeline mostra checkbox + título.
3. Marcar como concluída → estado visual riscado + checkmark.
4. SQL de verificação:
   ```sql
   select kind, subject, payload->>'status' as status, payload->>'due_date' as due
     from public.activities
    where contact_id = '<id>' and kind = 'task'
    order by occurred_at desc limit 5;
   ```
5. Toggle persiste: recarregar página, estado mantém.

### Teste 3 — Cross-record (deal puxa contact + company)

1. Em `/crm/negocios/<deal-id>` → `Call`.
2. Confere que a activity foi criada com `deal_id`, `contact_id` e `company_id` preenchidos.
3. Abrir `/crm/contatos/<contact-id>` — a mesma call aparece lá (RLS herdado por contact_id).

---

## Verificação local

- [x] `npx tsc --noEmit` passa.
- [x] `node --check` em todos `extension/*.js` passa (extensão não foi tocada).
- [ ] Teste empírico — depende de subir o Vite + login.

---

## Limites conhecidos

- **Sem editor de tarefa**: criou, marcou done, mas não dá pra editar título / due date depois sem ir direto ao banco. Edit inline fica pra Phase 1G ou phase dedicada.
- **Sem `assignee_id` real ainda**: o input não existe no `CreateTaskModal`. Toda task fica atribuída implicitamente ao `created_by`. Ajustar quando user picker for necessário (depois que Settings tiver gestão de users).
- **Meeting modal não wirado** — service `createMeetingActivity` existe, falta UI. Meetings podem ser logados via API ou edge function por enquanto.
- **TaskItem é otimista no front** — se a row mudar no banco por outra fonte (worker, outro user), a UI só pega na próxima refetch (polling 30s).

---

## Próximo

**Phase 1G — Property inline edit**. Sidebar direita das pages Detail (read-only hoje) ganha edição inline campo-a-campo. Persiste via `update` em `contacts`/`companies`/`deals`, com geração automática de `activity kind='property_change'` pra audit trail. Spec detalhado já no [`CODEX_HANDOFF.md`](./CODEX_HANDOFF.md) §5.
