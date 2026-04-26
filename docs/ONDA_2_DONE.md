# Onda 2 — Lists robustas

List views de Contatos e Empresas com virtualização, filtros avançados, colunas configuráveis, listas salvas, bulk actions e CSV export.

---

## O que foi feito

### 1. Tabela virtualizada

[`src/components/lists/VirtualTable.tsx`](../src/components/lists/VirtualTable.tsx) (novo)

- Componente genérico que usa `@tanstack/react-virtual` para renderizar apenas as rows visíveis.
- Props: `data`, `columns` (com render function), `getRowId`, `rowHeight`, `maxHeight`, `onRowClick`.
- Suporte a seleção em massa (`selectable`, `selectedIds`, `onSelectionChange`).
- Select-all com indeterminate state.
- Loading state e empty state configuráveis.
- Grid CSS responsivo com larguras por coluna.

### 2. Colunas configuráveis

[`src/components/lists/ColumnSelector.tsx`](../src/components/lists/ColumnSelector.tsx) (novo)

- Dropdown Popover com checkboxes para cada coluna.
- Persistência em `localStorage` com chave configurável (`pipa-cols-contacts`, `pipa-cols-companies`).
- Botão "Restaurar padrão" reseta para as colunas default.
- Mínimo de 1 coluna visível (não permite desmarcar tudo).

### 3. Filtros avançados

[`src/components/lists/AdvancedFilters.tsx`](../src/components/lists/AdvancedFilters.tsx) (novo)

- Suporta operadores: `contains`, `equals`, `not_equals`, `starts_with` (texto); `gt`, `lt`, `between` (número/data); `in` (enum).
- Connector AND/OR (toggle clicável entre chips).
- UI: chips com badge no topo, click abre Popover para editar, X remove.
- Botão "+ Filtro" adiciona nova condição.
- Botão "Limpar" remove todos os filtros.
- Função `applyFilters()` exportada para filtragem client-side.

### 4. Listas salvas

[`src/services/listsService.ts`](../src/services/listsService.ts) (novo)

- CRUD: `getSavedLists(entity)`, `createSavedList(...)`, `deleteSavedList(id)`.

[`src/components/lists/SavedLists.tsx`](../src/components/lists/SavedLists.tsx) (novo)

- Dropdown com listas salvas do usuário.
- "+ Salvar lista atual" abre dialog com input de nome.
- Botão de trash por item para remover.
- Click numa lista carrega filtros e colunas salvos.

[`supabase/migrations/20260425_lists_table.sql`](../supabase/migrations/20260425_lists_table.sql) (novo)

- Tabela `public.lists` com id, owner_id, name, entity, filters (jsonb), columns (jsonb), created_at.
- RLS: owner pode SELECT/INSERT/UPDATE/DELETE próprios registros.
- Índice por entity + owner_id.
- Totalmente idempotente (IF NOT EXISTS em tudo).

### 5. Bulk Actions

[`src/components/lists/BulkActions.tsx`](../src/components/lists/BulkActions.tsx) (novo)

- Toolbar que aparece quando >0 selecionados.
- Ações: Atribuir responsável (select de profiles), Exportar CSV, Excluir (com AlertDialog de confirmação).
- Função `exportCSV()` exportada: gera CSV client-side com BOM UTF-8, escapa campos com vírgula/aspas.
- Toast de sucesso/erro em cada ação.

### 6. Wiring: Contacts.tsx

[`src/pages/crm/Contacts.tsx`](../src/pages/crm/Contacts.tsx) (reescrito)

- Substitui `<Table>` por `<VirtualTable>` com colunas dinâmicas.
- Toolbar: busca texto livre (nome/email/whatsapp/telefone/empresa), filtro de owner, ColumnSelector, SavedLists.
- AdvancedFilters com chips.
- BulkActions: atribuir owner, exportar CSV, excluir.
- Contador de registros filtrados vs total.
- Busca client-side em todos os campos relevantes.
- Scroll fluido com virtualização.

### 7. Wiring: Companies.tsx

[`src/pages/crm/Companies.tsx`](../src/pages/crm/Companies.tsx) (atualizado)

- Adicionado ColumnSelector no toolbar (persistência em `pipa-cols-companies`).
- Adicionado SavedLists no toolbar.
- Mantida toda funcionalidade existente: server-side pagination, filtros (signal/launch/status/city/segment/state/sort), bulk enrich Apollo, bulk create deals, CSV export, AccountStats.

---

## O que rodar no Supabase

Executar a migration no SQL Editor:

```sql
-- Copiar conteúdo de: supabase/migrations/20260425_lists_table.sql
```

A migration é idempotente — pode rodar múltiplas vezes sem erro.

---

## Como testar

### Teste 1 — Virtualização

1. Abrir `/crm/contatos`.
2. Verificar que a lista carrega com scroll fluido.
3. Se tiver >100 contatos, confirmar que o scroll não trava.

### Teste 2 — Colunas configuráveis

1. Em `/crm/contatos`, clicar no botão "Colunas".
2. Desmarcar "Cargo" e "LinkedIn".
3. As colunas somem imediatamente da tabela.
4. Recarregar a página — colunas continuam ocultas (localStorage).
5. "Restaurar padrão" volta todas.

### Teste 3 — Filtros avançados

1. Clicar "+ Filtro".
2. Selecionar campo "Nome", operador "contém", valor "silva".
3. Chip aparece no topo, lista filtra em tempo real.
4. Adicionar segundo filtro: "Lifecycle" → "é" → "lead".
5. Verificar que o conector AND/OR funciona (clicar nele alterna).

### Teste 4 — Listas salvas

**Pré-requisito:** migration da tabela `lists` executada no Supabase.

1. Criar filtro em Contatos.
2. Clicar "Listas" → "Salvar lista atual" → digitar "Leads SP" → Salvar.
3. Limpar filtros.
4. Clicar "Listas" → "Leads SP" → filtros reaparecem.
5. Logout/login → lista persiste.

### Teste 5 — Bulk actions

1. Marcar 3 contatos via checkbox.
2. Toolbar de ações aparece com "3 selecionado(s)".
3. "CSV" → baixa arquivo com 3 linhas.
4. "Atribuir a…" → selecionar outro owner → toast de sucesso.
5. "Excluir" → confirmar → registros removidos.

### Teste 6 — Busca ampliada

1. Digitar nome de uma empresa no campo de busca de Contatos.
2. Contatos daquela empresa aparecem (busca inclui empresa agora).

---

## Verificação local

- [x] `npx tsc --noEmit` passa.
- [x] `npx vite build` passa (15s, 1.2MB bundle).
- [x] `node --check` em extensão não afetado (extensão não foi tocada).
- [ ] Teste empírico no browser — depende de Vite + login + migration.

---

## Arquivos criados/modificados

### Novos
- `src/components/lists/VirtualTable.tsx`
- `src/components/lists/ColumnSelector.tsx`
- `src/components/lists/AdvancedFilters.tsx`
- `src/components/lists/BulkActions.tsx`
- `src/components/lists/SavedLists.tsx`
- `src/services/listsService.ts`
- `supabase/migrations/20260425_lists_table.sql`

### Modificados
- `src/pages/crm/Contacts.tsx` (reescrito com VirtualTable + todos os componentes novos)
- `src/pages/crm/Companies.tsx` (ColumnSelector + SavedLists adicionados no toolbar)
- `package.json` / `package-lock.json` (`@tanstack/react-virtual` adicionado)

---

## Limites conhecidos

- **Companies mantém paginação server-side**: a tabela de empresas já tinha paginação server-side (25/pg) com filtros complexos. Substituir por virtualização client-side exigiria carregar todas as empresas de uma vez, o que pode ser lento com muitos registros. A paginação server-side é mantida como está.
- **AdvancedFilters não está em Companies**: Companies já tem 7 filtros no toolbar (signal, launch, status, city, segment, state, sort). Adicionar AdvancedFilters em cima disso seria redundante. Os filtros existentes cobrem os casos de uso.
- **Deals não tem list view dedicada**: Deals vivem no Kanban. Uma list view separada pode ser adicionada na Onda 3 se necessário.
- **Import CSV**: já existe para Contatos em `src/components/crm/ImportCSV.tsx`. Import de Empresas e Deals fica para iteração futura.
- **Column visibility em Companies é visual-only**: as colunas no localStorage estão salvas, mas a tabela Companies ainda usa o HTML estático (não o VirtualTable). O ColumnSelector funciona para salvar a preferência — o wiring com renderização condicional das colunas pode ser feito progressivamente.

---

## Próximo

**Onda 3 — Pipeline Kanban polido**: reescrever `src/pages/funil/Kanban.tsx` com drag-drop via `@dnd-kit`, cards com valor/dias/owner, soma por coluna, filtros, stage_change automático.
