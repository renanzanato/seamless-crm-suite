# Phase 1B — ActivityTimeline unificada

Feed cronológico reverso que lê de `public.activities` (tabela criada na Onda 0). Pronto pra ser plugado em `ContactDetail` / `CompanyDetail` / `DealDetail` nas Phases 1C–1E.

---

## O que foi feito

### 1. Service layer

[`src/services/activitiesService.ts`](../src/services/activitiesService.ts):

- `getActivitiesForContact(contactId, opts?)`
- `getActivitiesForCompany(companyId, opts?)`
- `getActivitiesForDeal(dealId, opts?)`

Cada um retorna `Activity[]` já normalizado (camelCase, autor resolvido via join em `profiles`).

**Options**:
- `limit` (default 200)
- `kinds` — filtro por array de `ActivityKind` (server-side via `in`)
- `before` — cursor pra paginação (`occurred_at < before`)

### 2. Item renderers

[`src/components/activities/TimelineItems.tsx`](../src/components/activities/TimelineItems.tsx):

Um componente por `kind`:
- `NoteItem` — body multilinha
- `WhatsAppItem` — renderiza áudio, imagem, sticker, vídeo e documento reais lendo `payload.media_url` (com fallback pra placeholder quando tiver `media_download_error`)
- `EmailItem` — subject + preview de 2 linhas
- `CallItem` — duração + outcome + anotação
- `MeetingItem` — título + local + link
- `TaskItem` — checkbox toggle (optimistic) + due date
- `StageChangeItem` — "De X → Para Y" com pills visuais
- `PropertyChangeItem` — campo + valor antigo riscado + valor novo
- `SequenceStepItem` — "Sequence X, passo N via canal"
- `EnrollmentItem` — entrou/saiu da cadência
- `UnknownItem` — fallback pra qualquer `kind` não mapeado (não deixa UI quebrar)

Todos usam `ItemShell` compartilhado: ícone com cor por kind (timeline dot), título + subtítulo, autor + hora no canto, borda esquerda tintada azul (inbound) / verde (outbound) quando aplicável.

`renderActivity(activity)` faz dispatch.

### 3. Componente principal

[`src/components/activities/ActivityTimeline.tsx`](../src/components/activities/ActivityTimeline.tsx):

Props:
```ts
{
  contactId?: string;
  companyId?: string;
  dealId?: string;
  kindFilter?: ActivityKind[];
  emptyHint?: string;
  hideFilters?: boolean;
  pollMs?: number; // default 30000
}
```

Comportamento:
- `useQuery` com key `['activities', scope, id, kinds]` e `refetchInterval` configurável.
- Chips de filtro no topo: **Tudo**, WhatsApp, E-mail, Ligações, Reuniões, Notas, Tarefas, Stage, Propriedades, Cadência, Enrollments. Multi-select.
- Agrupamento por dia (Hoje / Ontem / Quarta / 15 de abr. 2026).
- Empty state com ícone + mensagem customizável via `emptyHint`.
- Loading / error states cobertos.

---

## O que rodar no Supabase

**Nada.** Phase 1B é só frontend. A tabela `activities` foi criada na Onda 0.

---

## Como testar

### Teste 1: verificar que tem dados

```sql
select kind, count(*)
  from public.activities
 group by kind
 order by 2 desc;
```

Esperado: pelo menos `whatsapp` populado pelas capturas da Phase 1A.2.

### Teste 2: renderização direta

Ainda não tem tela que usa o componente — isso é escopo da Phase 1C. Pra testar isoladamente enquanto 1C não chega, você pode:

**Opção A**: criar uma página temporária de teste (`/test/timeline/:contactId`) que renderiza `<ActivityTimeline contactId={id} />`.

**Opção B**: pegar um `contact_id` real, rodar no SQL Editor:

```sql
select id, kind, occurred_at, body, direction, payload->>'message_type' as msg_type
  from public.activities
 where contact_id = '<contact-id>'
 order by occurred_at desc
 limit 20;
```

E comparar com o que a timeline vai renderizar — deve bater 1:1.

### Teste 3: filtros

Passar `kindFilter={['whatsapp']}` só renderiza mensagens WhatsApp. Clicar nos chips alterna visualmente.

---

## Verificação local feita

- [x] `npx tsc --noEmit` passa.
- [x] Componentes não quebram quando `activities` está vazio (empty state).
- [x] Payload `media_url` é lido corretamente (herdado da Phase 1A.2).
- [ ] Teste empírico com dados de produção — depende de Phase 1C plugar na UI.

---

## Limites conhecidos

- **Sem paginação visual**: fetch traz até 200 por default. Se a conversa tem mais que isso, antigas ficam ausentes. Paginar via cursor `before` quando necessário.
- **Sem virtualização**: 500+ items vai engasgar. Se aparecer, usar `react-virtuoso`.
- **TaskItem toggle** atualmente só é optimistic — não persiste no backend. Task CRUD entra na Phase 1F.
- **Stage/property change handlers**: o componente renderiza, mas não existe (ainda) lógica que CRIA essas activities automaticamente. Isso entra na Phase 1C (inline edit) e Phase 3 (Kanban com drag-drop).

---

## Próximo passo

**Phase 1C — ContactDetail overhaul**. Plugar `<ActivityTimeline contactId={id} />` no centro da página, com sidebar de propriedades à direita e relações à esquerda. Detalhes no [`CODEX_HANDOFF.md`](./CODEX_HANDOFF.md) §5.
