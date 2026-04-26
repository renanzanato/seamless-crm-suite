# Onda 5 — Sequences funcionais

Worker de cadencia, enroll operacional e unenroll automatico por avanço de deal.

---

## O que foi feito

### 1. Migration de suporte

[`supabase/migrations/20260425_sequence_worker_support.sql`](../supabase/migrations/20260425_sequence_worker_support.sql)

- `cadence_tracks` passa a funcionar como enrollment ativo:
  - `enrolled_at`
  - `owner_id`
  - `updated_at`
- Status ampliados sem remover valores legados:
  - `active`, `paused`, `completed`, `meeting_booked`, `proposal_sent`, `won`, `lost`, `errored`
  - preserva `pending`, `done`, `skipped`, `replied`
- Índices para worker e dedupe de daily tasks por track/dia/tipo.
- Trigger `trg_unenroll_cadence_on_deal_stage`:
  - ao mover deal para estágio de reunião, proposta ou fechamento, encerra tracks ativas da empresa.
  - sincroniza `companies.cadence_status`.

### 2. Edge Function worker

[`supabase/functions/sequence-worker/index.ts`](../supabase/functions/sequence-worker/index.ts)

- Pode rodar por cron ou manualmente.
- Busca `cadence_tracks.status='active'`.
- Calcula `cadence_day` a partir de `enrolled_at` usando dias úteis do calendário BR.
- Gera `daily_tasks` do dia com base no `PIPA_21_DAY_CADENCE`.
- Personaliza `generated_message` via `personalizeTemplate()`.
- Não duplica task já existente para mesmo `cadence_track_id + cadence_day + task_type`.
- Cria `activity kind='sequence_step'` para cada task nova.
- Respeita janela comercial `America/Sao_Paulo`, dias úteis, 08h-18h.
- Aceita execução manual com `force: true`.

### 3. Service layer

[`src/services/abmService.ts`](../src/services/abmService.ts)

- `getCadenceTracks()`
- `setCadenceTrackStatus()`
- `runSequenceWorker()`
- `startCadenceForContacts()` agora cria/retoma tracks ativos e gera só as tasks vencidas do dia, mantendo compatibilidade com chamadas existentes.

[`src/services/activitiesService.ts`](../src/services/activitiesService.ts)

- `createStageChangeActivity()` também tenta fazer unenroll client-side como fallback.
- A migration mantém o trigger como caminho robusto para mudanças de stage feitas por qualquer fluxo.

### 4. UI de Sequencias

[`src/pages/SequenciasPage.tsx`](../src/pages/SequenciasPage.tsx)

- Lista de `cadence_tracks` com:
  - empresa
  - contato
  - status
  - dia atual
  - próxima ação
- Botões Pausar / Retomar por track.
- Botão Enroll com seletor de empresa + contato.
- Botão "Rodar worker" para invocação manual.
- Estatísticas:
  - ativas
  - completadas
  - taxa de conversão
  - total

### 5. Lib compartilhável com Edge

[`src/lib/pipaGtm.ts`](../src/lib/pipaGtm.ts)

- Removeu dependência de alias `@/` em type-only import para permitir import relativo pela Edge Function.

---

## O que rodar no Supabase

1. Rodar a migration:

```sql
-- supabase/migrations/20260425_sequence_worker_support.sql
```

2. Deploy da Edge Function:

```bash
supabase functions deploy sequence-worker
```

3. Cron sugerido:

- Supabase Dashboard -> Edge Functions -> `sequence-worker` -> Schedule
- Frequência: a cada 5 minutos
- Body:

```json
{}
```

Para teste manual fora da janela comercial:

```json
{ "force": true }
```

---

## Como testar

### Teste 1 — Enroll

1. Abrir `/sequencias`.
2. Selecionar empresa.
3. Selecionar contato.
4. Clicar `Enroll`.
5. Confirmar que aparece uma nova linha em `cadence_tracks`.

SQL:

```sql
select id, company_id, contact_id, status, cadence_day, enrolled_at
  from public.cadence_tracks
 order by enrolled_at desc
 limit 10;
```

### Teste 2 — Worker idempotente

1. Clicar `Rodar worker` na UI ou invocar a function com `{ "force": true }`.
2. Rodar de novo.
3. Confirmar que não duplica task para mesmo track/dia/tipo.

SQL:

```sql
select cadence_track_id, cadence_day, task_type, count(*)
  from public.daily_tasks
 where cadence_track_id is not null
 group by 1, 2, 3
having count(*) > 1;
```

Esperado: zero linhas.

### Teste 3 — Timeline

```sql
select kind, subject, payload
  from public.activities
 where kind = 'sequence_step'
 order by occurred_at desc
 limit 10;
```

### Teste 4 — Unenroll automatico

1. Com uma empresa em cadencia ativa, mover um deal dela para `Proposta`.
2. Conferir que tracks ativas da empresa viraram `proposal_sent`.

```sql
select status, count(*)
  from public.cadence_tracks
 group by status;
```

---

## Verificacao local

- [x] `npx tsc --noEmit --pretty false` passa.
- [x] `npm run build` passa.
- [x] `npm run test` passa.
- [x] `npm run lint` passa com warnings legados de Fast Refresh.
- [x] `node --check` em `extension/*.js` e `extension/lib/*.js` passa (extensao nao foi alterada).
- [ ] `deno check` da Edge Function — Deno nao esta instalado neste ambiente local.
- [ ] Edge Function deploy/teste real no Supabase.
- [ ] Cron configurado no Dashboard.

---

## Limites conhecidos

- O envio real de WhatsApp/email ainda depende do operador executar a `daily_task`; o worker gera a tarefa e a mensagem, não dispara canal automaticamente.
- O cron precisa ser configurado no Supabase Dashboard depois do deploy.
- Tracks legadas com status `pending/done/skipped/replied` foram preservadas e não são processadas pelo worker.
