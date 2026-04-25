# Phase 1E — DealDetail

Criada a página de detalhe de negócio em `/crm/negocios/:id`, seguindo o mesmo padrão de record detail usado em contatos e empresas.

---

## O que foi feito

### 1. Nova página

[`src/pages/crm/DealDetail.tsx`](../src/pages/crm/DealDetail.tsx):

- Header com título, stage, valor, data prevista, empresa, contato e quick actions.
- Sidebar esquerda com empresa e contato vinculados.
- Centro com `<ActivityTimeline dealId={id} />`.
- Sidebar direita com propriedades read-only do deal.
- Estados de loading e not-found.

### 2. Quick actions

- `Add note`: cria `activity kind='note'` com `deal_id`, `company_id` e `contact_id` quando disponíveis.
- `Move stage`: atualiza `deals.stage` e cria `activity kind='stage_change'` com `from_stage` e `to_stage` no payload.
- `WhatsApp`: abre `wa.me` usando o WhatsApp/telefone do contato vinculado.
- `Editar`: reaproveita `DealForm`.

### 3. Rotas e navegação

- `src/App.tsx` ganhou rota `/crm/negocios/:id`.
- A lista do `PipelinePage` agora permite abrir o detalhe clicando no título do deal.
- A sidebar de deals em `CompanyDetail` também navega para o detalhe.

### 4. Service layer

[`src/services/crmService.ts`](../src/services/crmService.ts):

- `getDeal(id)` com joins de funil, contato, empresa e owner.

[`src/services/activitiesService.ts`](../src/services/activitiesService.ts):

- `createStageChangeActivity(...)`.

---

## O que rodar no Supabase

**Nada.** Phase 1E não adiciona migration.

---

## Como testar

1. Abrir `/crm/negocios`.
2. Clicar no título de um deal.
3. Confirmar `/crm/negocios/<deal-id>` com header + três colunas.
4. Adicionar nota e confirmar activity com `deal_id`.
5. Mover stage e confirmar:
   - `deals.stage` atualizado.
   - `activities.kind = 'stage_change'` criado.
   - Timeline atualiza após a ação.

SQL de apoio:

```sql
select kind, body, deal_id, payload, occurred_at
from public.activities
where deal_id = '<deal-id>'
order by occurred_at desc
limit 10;
```

---

## Verificação local feita

- [x] `npx tsc --noEmit`
- [x] `node --check extension/*.js extension/lib/*.js`
- [ ] Teste manual em browser com dados reais.

---

## Limites conhecidos

- O move stage usa o campo textual `deals.stage`, alinhado ao `DealForm` atual. O kanban novo também usa `stage_id`; unificar isso fica para a Phase 3 do pipeline.
- Propriedades seguem read-only. Inline edit fica para a Phase 1G.
