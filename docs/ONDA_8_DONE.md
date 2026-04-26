# Onda 8 — Sequences V2 (Apollo-style)

Builder visual node-based (ReactFlow) com branching, múltiplos step types, tracking e Edge Function worker.

---

## Bugs corrigidos na revisão

1. **Edge Function reescrita**: lógica de `wait` corrigida (planta marker na 1ª passagem, verifica tempo decorrido nas seguintes). Condition branching agora usa `if_true_step_position` / `if_false_step_position` do config.
2. **stop_on_reply**: worker verifica replies inbound antes de executar qualquer step.
3. **Idempotência**: unique index parcial em `(enrollment_id, step_id) WHERE status IN ('sent','queued')` impede runs duplicados.
4. **Migration ampliada**: adicionadas colunas `channel` na `sequences`, `position` e `last_step_at` na `cadence_tracks` (IF NOT EXISTS).
5. **Service role key**: Edge Function usa `SUPABASE_SERVICE_ROLE_KEY` para bypass de RLS (worker é trusted).
6. **Business hours**: todos os action steps só executam em horário comercial (9-18h BRT, seg-sex).

---

## Arquivos

### Novos
- `src/services/sequencesV2Service.ts` — CRUD steps v2, stats, upsert sequence simplificado
- `src/pages/SequenceBuilderV2.tsx` — builder visual com ReactFlow
- `src/components/sequence-builder/StepNode.tsx` — node customizado
- `src/components/sequence-builder/StepConfigPanel.tsx` — painel lateral config
- `src/components/sequence-builder/StepPalette.tsx` — paleta de step types
- `src/components/sequence-builder/SequenceStats.tsx` — aba de estatísticas com recharts
- `supabase/migrations/20260425_sequences_v2.sql` — tabelas + RLS + indexes
- `supabase/functions/sequence-worker-v2/index.ts` — Edge Function worker

### Modificados
- `src/App.tsx` — rotas `/sequencias-v2/nova` e `/sequencias-v2/:id`

---

## SQL para rodar no Supabase

Cole o conteúdo completo de `supabase/migrations/20260425_sequences_v2.sql` no SQL Editor do Supabase.

---

## Como testar

1. Rode o SQL no Supabase SQL Editor.
2. Acesse `http://localhost:8080/sequencias-v2/nova`.
3. Arraste steps da paleta esquerda (Email, WhatsApp, Wait, Condition, etc.).
4. Clique num node pra editar o config no painel direito.
5. Salve.
6. Para testar o worker: `supabase functions serve sequence-worker-v2`.

---

## Próximo

- **Onda 9** — Email OAuth (Gmail/Outlook) para envio real + tracking de opens/clicks.
- **Onda 10** — Notifications in-app + mentions.
- **Onda 11** — Search global + mobile responsive + polish.
