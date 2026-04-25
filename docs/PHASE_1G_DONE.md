# Phase 1G — Property inline edit

Sidebars de propriedades em Contact / Company / Deal agora editam campos inline e geram `activity kind='property_change'` automaticamente para auditoria.

---

## O que foi feito

### 1. InlineEdit reutilizavel

[`src/components/crm/InlineEdit.tsx`](../src/components/crm/InlineEdit.tsx)

- Renderiza valor como texto normal.
- Clique no campo abre modo de edicao.
- Suporta `text`, `textarea`, `select`, `date` e `number`.
- `Enter` salva em inputs, `Ctrl/Cmd+Enter` salva textarea, `Esc` cancela.
- `blur` salva inputs/textareas.
- Select salva ao escolher uma opcao.
- Valida numero, data e enum antes de chamar o `onSave`.

### 2. Service helpers

[`src/services/activitiesService.ts`](../src/services/activitiesService.ts)

- `createPropertyChangeActivity(...)` cria linha em `activities` com:
  - `kind='property_change'`
  - `payload.source='inline_edit'`
  - `payload.record_type`
  - `payload.field`
  - `payload.old`
  - `payload.new`
- `updateRecordField(...)` atualiza o campo no registro e tenta espelhar a mudanca na timeline.
- Wrappers adicionados:
  - `updateContactProperty(...)`
  - `updateCompanyProperty(...)`
  - `updateDealProperty(...)`

### 3. ContactDetail

[`src/pages/crm/ContactDetail.tsx`](../src/pages/crm/ContactDetail.tsx)

Campos inline:

- Nome
- Lifecycle
- Cargo
- Senioridade
- Origem
- E-mail
- WhatsApp
- Telefone

Campos relacionais continuam read-only por enquanto: empresa, owner, departamentos, datas de auditoria.

### 4. CompanyDetail

[`src/pages/crm/CompanyDetail.tsx`](../src/pages/crm/CompanyDetail.tsx)

Campos inline:

- Status
- Sinal
- Dominio
- CNPJ
- Cidade
- Estado
- Segmento
- Modelo comercial
- VGV projetado
- Midia mensal
- Cadencia

Tambem foi corrigido um bug de runtime na pagina de empresas: os modais `LogCallModal` e `CreateTaskModal` usavam `user?.id`, mas o componente usa `profile/session`. Agora ambos usam `actorId`.

### 5. DealDetail

[`src/pages/crm/DealDetail.tsx`](../src/pages/crm/DealDetail.tsx)

Campos inline:

- Titulo
- Stage
- Valor
- Fechamento previsto

Campos relacionais continuam read-only: funil, empresa, contato, owner e data de criacao.

---

## O que rodar no Supabase

Nada. A Phase 1G usa tabelas e colunas existentes.

---

## Como testar

### Teste 1 — Contact property change

1. Abrir `/crm/contatos/<id>`.
2. Clicar em `Cargo`, alterar o valor e sair do campo.
3. A timeline deve receber um item `property_change`.
4. SQL:

```sql
select kind, subject, payload
  from public.activities
 where contact_id = '<id>' and kind = 'property_change'
 order by occurred_at desc
 limit 5;
```

### Teste 2 — CompanyDetail bug fix

1. Abrir `/crm/empresas/<id>`.
2. Clicar em `Call` e `Task`.
3. Os modais devem abrir sem erro de `user is not defined`.

### Teste 3 — Company inline edit

1. Em `/crm/empresas/<id>`, editar `Status` ou `Cidade`.
2. Recarregar a pagina.
3. O valor deve persistir e a timeline da empresa deve mostrar `property_change`.

### Teste 4 — Deal inline edit

1. Abrir `/crm/negocios/<id>`.
2. Editar `Valor` ou `Fechamento previsto`.
3. Confirmar persistencia e item `property_change` na timeline do deal.

---

## Verificacao local

- [x] `npx tsc --noEmit --pretty false` passa.
- [x] `npm run build` passa.
- [x] `npm run test` passa.
- [x] `node --check` em `extension/*.js` e `extension/lib/*.js` passa.
- [ ] Teste empirico no browser — depende de Vite + login.

---

## Limites conhecidos

- Campos relacionais (`owner_id`, `company_id`, `contact_id`, `funnel_id`) seguem read-only ate existir picker proprio.
- Departamentos do contato seguem read-only porque hoje sao array e precisam de controle dedicado.
- Editar stage diretamente pelo inline edit gera `property_change`; o botao dedicado `Mover stage` continua gerando `stage_change`.

---

## Status

Com a Phase 1G, a **Onda 1 — Record Detail com timeline real** fica fechada no roadmap.
