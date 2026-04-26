# Onda 3 — Pipeline Kanban polido

Kanban de deals com drag-drop, soma de valor por coluna, dias em stage, owner no card, filtros via URL params, toggle "so meus", e stage_change activity automatica.

---

## O que foi feito

### 1. DealCard novo

[`src/components/funil/DealCard.tsx`](../src/components/funil/DealCard.tsx) (novo)

- Titulo do deal com hover highlight.
- Empresa + contato abaixo do titulo.
- Valor formatado (R$ compacto) com icone verde.
- Dias em stage (clock icon).
- Avatar do owner (iniciais) no canto inferior direito.
- Click no card navega pra `/crm/negocios/:id`.
- Drag-and-drop via `@dnd-kit/core` (useDraggable).

### 2. StageColumn reescrito

[`src/components/funil/StageColumn.tsx`](../src/components/funil/StageColumn.tsx) (reescrito)

- Header: nome do stage + contador de deals.
- **Soma de valor agregado** no topo de cada coluna.
- Drop zone com highlight visual quando arrastando sobre.
- Scroll vertical interno quando muitos cards.
- Empty state: "Arraste deals aqui".

### 3. KanbanBoard reescrito

[`src/components/funil/KanbanBoard.tsx`](../src/components/funil/KanbanBoard.tsx) (reescrito)

- Usa `DEAL_STAGES` do types para gerar colunas (sem depender de tabela stages).
- **Optimistic update**: card move imediatamente, mutation em background.
- **Rollback**: em erro, volta ao estado anterior + toast.error.
- **`createStageChangeActivity`**: stage change gera activity `kind='stage_change'` automaticamente na timeline.
- DragOverlay com card visual durante arraste.

### 4. Kanban.tsx reescrito

[`src/pages/funil/Kanban.tsx`](../src/pages/funil/Kanban.tsx) (reescrito)

- Header: titulo "Pipeline" + total de deals + valor total agregado.
- **Toggle "Todos / So meus"**: filtra por `owner_id = auth.uid()`.
- **Filtro de owner**: multi-select dos profiles (admin only).
- **Filtros em URL params**: `?owner=...&view=mine` — persistem entre navegacao.
- **Botao "+ Novo deal"**: abre `<DealForm>` existente.
- Real-time: subscricao em `deals` table, invalida queries automaticamente.
- Loading state.

### 5. KanbanCard.tsx archivado

Movido para `src/components/funil/_archived/KanbanCard.tsx` (conforme regra: nunca deletar).

---

## O que rodar no Supabase

**Nada.** Onda 3 nao cria nova tabela nem migration.

---

## Como testar

### Teste 1 — Drag-drop + stage_change

1. Abrir a rota do Pipeline/Kanban.
2. Arrastar um deal de "Qualificacao" para "Proposta".
3. Card move imediatamente (optimistic).
4. Abrir `/crm/negocios/:id` do deal arrastado.
5. Na timeline deve aparecer activity `kind='stage_change'` com "Qualificacao -> Proposta".

### Teste 2 — Soma por coluna

1. Verificar que cada coluna mostra a soma dos valores dos deals vissiveis.
2. Mover um deal com valor de uma coluna pra outra.
3. Somas atualizam imediatamente.

### Teste 3 — Filtros

1. Clicar "So meus" — so deals do meu owner_id aparecem.
2. Selecionar outro owner no dropdown — so deals dele aparecem.
3. URL muda pra `?view=mine&owner=...`.
4. Recarregar pagina — filtros persistem.
5. "Limpar" volta pra "Todos".

### Teste 4 — Click no card

1. Clicar num card do Kanban.
2. Deve navegar para `/crm/negocios/:id` (DealDetail).

### Teste 5 — Novo deal

1. Clicar "+ Novo deal".
2. DealForm abre.
3. Criar deal.
4. Deal aparece na coluna correta do Kanban.

---

## Verificacao local

- [x] `npx tsc --noEmit` passa.
- [x] Build passa.
- [x] Extensao nao tocada.
- [ ] Teste empirico no browser — depende de Vite + login.

---

## Arquivos criados/modificados

### Novos
- `src/components/funil/DealCard.tsx`

### Reescritos
- `src/components/funil/StageColumn.tsx`
- `src/components/funil/KanbanBoard.tsx`
- `src/pages/funil/Kanban.tsx`

### Archivados
- `src/components/funil/_archived/KanbanCard.tsx`

---

## Limites conhecidos

- **Kanban usa DEAL_STAGES fixo**: as colunas vem do array `DEAL_STAGES` em `@/types`, nao da tabela `stages`. Isso e intencional — a spec da Onda 3 diz pra usar DEAL_STAGES. Na Onda 7 (Settings), quando stages forem editaveis, o Kanban pode ser ajustado.
- **Sem virtualizacao intra-coluna**: com <300 deals, nao e necessario. Se tiver >300, adicionar virtualizacao vertical dentro de cada coluna.
- **Source filter nao implementado**: o prompt mencionava filtro de source, mas deals nao tem campo source. Pode ser adicionado futuramente.
- **DealForm**: reutiliza o existente. Se nao tiver props `open/onOpenChange`, pode precisar de ajuste.

---

## Proximo

**Onda 4 — Today / Inbox**: reescrever HojePage com 5 secoes acionaveis + badge no sidebar.
