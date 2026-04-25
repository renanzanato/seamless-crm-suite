# Phase 1C — ContactDetail overhaul

`ContactDetail` agora usa o layout de record detail em três colunas, com timeline unificada no centro e conversa WhatsApp em bolhas.

---

## O que foi feito

### 1. Layout de record detail

- Header com avatar, nome, lifecycle stage, origem de enriquecimento, cargo, empresa, owner, e canais principais.
- Sidebar esquerda com resumo da empresa, deals ligados por `deals.contact_id`, e contatos irmãos da mesma empresa.
- Centro com abas:
  - `Timeline` renderizando `<ActivityTimeline contactId={id} />`.
  - `Conversa WhatsApp` renderizando `<ConversationView />` a partir de `activities kind='whatsapp'`.
- Sidebar direita com canais e propriedades read-only até a Phase 1G.

### 2. Fluxos preservados

- Apollo phone reveal / waterfall continua com estado de carregamento, timeout, retry e listener realtime em `contacts`.
- Botões de enriquecimento continuam nos canais de E-mail e WhatsApp quando o dado está ausente.
- `ContactForm` admin continua abrindo pelo botão `Editar` e refaz `refetch()` ao fechar.
- Loading, not-found e navegação de volta continuam cobertos.

### 3. Helpers novos

[`src/services/crmService.ts`](../src/services/crmService.ts):

- `getContactRelations(contactId, companyId)` busca empresa, deals por `contact_id`, e contatos irmãos.

[`src/services/activitiesService.ts`](../src/services/activitiesService.ts):

- `createNoteActivity({ contactId, companyId, body, createdBy })` insere `kind='note'` em `activities`.

[`src/types/index.ts`](../src/types/index.ts):

- `ContactLifecycleStage`
- `Contact.lifecycle_stage`

### 4. Quick actions

- `Add note`: abre textarea inline, salva em `activities`, fecha no sucesso e invalida a timeline do contato.
- `Send WhatsApp`: abre `wa.me` usando `contact.whatsapp ?? contact.phone`.
- `Log call`, `Create task`, `Create deal`: placeholders via toast para a Phase 1F.

---

## O que rodar no Supabase

**Nada.** Phase 1C não adiciona migration.

---

## Como testar

### Teste 1: abrir detalhe do contato

Abrir:

```text
/crm/contatos/<contact-id>
```

Esperado:

- Header + três colunas no desktop.
- Layout empilhado no mobile.
- Timeline central carregando `activities`.
- Sidebars mostrando relações e propriedades.

### Teste 2: adicionar nota

1. Clicar em `Add note`.
2. Escrever uma nota.
3. Salvar.

Esperado:

- Row nova em `public.activities` com `kind = 'note'`.
- Timeline atualiza sem reload manual.

SQL de apoio:

```sql
select kind, body, contact_id, company_id, occurred_at
from public.activities
where kind = 'note'
order by occurred_at desc
limit 5;
```

### Teste 3: conversa WhatsApp

Abrir a aba `Conversa WhatsApp`.

Esperado:

- Mensagens de `activities kind='whatsapp'` aparecem em bolhas.
- Media continua usando `payload.media_url`, `payload.media_mime`, `payload.media_size`.

### Teste 4: fluxos preservados

- Botão `Editar` abre o `ContactForm` para admin.
- Apollo reveal continua mostrando progresso/waterfall, retry e timeout.
- `Send WhatsApp` abre a URL `wa.me` correta quando há telefone.

---

## Verificação local feita

- [x] `npx tsc --noEmit`
- [x] `node --check extension/background.js`
- [x] `node --check extension/content_script.js`
- [x] `node --check extension/inject-wa.js`
- [x] `node --check extension/popup.js`
- [x] `node --check extension/ui-injector.js`
- [x] `node --check extension/lib/wa-bridge.js`
- [ ] Teste manual em browser com dados reais

---

## Limites conhecidos

- Propriedades ainda são read-only. Inline edit fica para a Phase 1G.
- Call/task/deal ainda são placeholders. Modais reais ficam para a Phase 1F.
- `DealDetail` ainda não existe, então a sidebar lista deals sem navegar para o detalhe.
