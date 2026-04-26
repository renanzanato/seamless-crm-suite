# Onda 6 — Reports minimos

Pagina /reports com 4 graficos: funil de conversao, velocidade do pipeline, performance por owner, atividade semanal.

---

## O que foi feito

### 1. Reports Service

[`src/services/reportsService.ts`](../src/services/reportsService.ts) (novo)

- `getFunnelData(periodDays, ownerId?)` — deals por stage com contagem e valor.
- `getVelocityData()` — tempo medio por stage usando deal_history ou fallback para activities stage_change.
- `getOwnerPerformance(periodDays)` — deals ganhos/perdidos + valor total por owner.
- `getWeeklyActivity()` — contagem de activities por kind nas ultimas 12 semanas.

### 2. Reports Page

[`src/pages/Reports.tsx`](../src/pages/Reports.tsx) (novo)

- Layout grid 2x2 com 4 cards.
- Filtros globais: periodo (30/60/90/180/365 dias ou todo periodo) + owner (admin only).
- Graficos via recharts (BarChart, stacked bars, horizontal bars).
- Cores harmonicas do design system (HSL), dark mode friendly.
- Tooltips customizados com borda e fundo do card.
- Sumarios abaixo de cada grafico (total deals, valor, taxa conversao, ciclo total).
- Loading skeletons.

### 3. Rota e Sidebar

- Rota `/reports` adicionada em App.tsx (lazy loaded).
- Item "Relatorios" com icone BarChart3 adicionado no sidebar, secao CRM.

---

## Arquivos criados/modificados

### Novos
- `src/services/reportsService.ts`
- `src/pages/Reports.tsx`

### Modificados
- `src/App.tsx` (rota /reports)
- `src/components/AppSidebar.tsx` (item Relatorios no menu)

### Dependencias
- `recharts` (ja estava instalado, confirmado)

---

## Verificacao

- [x] `npx tsc --noEmit` passa.
- [x] Extensao nao tocada.

---

## Proximo

**Onda 7 — Settings no-code** (users + pipelines + custom fields + templates).
