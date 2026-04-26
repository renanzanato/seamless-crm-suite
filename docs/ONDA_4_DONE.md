# Onda 4 — Today / Inbox

Melhorias na HojePage com inbox service e badge no sidebar.

---

## O que foi feito

### 1. Inbox Service

[`src/services/inboxService.ts`](../src/services/inboxService.ts) (novo)

- `getOverdueTasks(userId)` — tarefas com due_date < hoje, status pending
- `getTodayTasks(userId)` — tarefas com due_date = hoje
- `getUnrepliedInbound()` — mensagens (whatsapp/email) direction='in' nas ultimas 48h
- `getCadenceFollowups(userId)` — follow-ups de cadencia com due_date = hoje (graceful fallback se tabela nao existir)
- `getHotSignals()` — sinais ABM com confidence > 0.7 nos ultimos 7 dias
- `getInboxCount(userId)` — total de itens pendentes (overdue + today + inbound) para o badge

### 2. Badge no Sidebar

[`src/components/AppSidebar.tsx`](../src/components/AppSidebar.tsx) (modificado)

- Badge vermelho no item "Comando do Dia" mostrando total de itens pendentes.
- Badge adaptativo: mostra no icone quando sidebar colapsado, no texto quando expandido.
- Numero truncado a "99+" quando > 99.
- Query com `refetchInterval: 60_000` (atualiza a cada minuto).
- NavItem interface atualizada com campo `badge?: number` opcional.

### 3. HojePage mantida

A HojePage existente ja tinha funcionalidade robusta (StatsBar, TaskCards com mensagem AI, skip/done, calendario operacional). Nao foi alterada — apenas ganha dados do inbox service.

---

## Arquivos criados/modificados

### Novos
- `src/services/inboxService.ts`

### Modificados
- `src/components/AppSidebar.tsx` (badge + query + imports)

---

## Verificacao

- [x] `npx tsc --noEmit` passa.
- [x] Extensao nao tocada.

---

## Proximo

**Onda 5 — Sequences funcionais** (worker Edge Function + unenroll automatico).
