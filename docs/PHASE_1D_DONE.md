# Phase 1D — CompanyDetail overhaul

`CompanyDetail` agora segue o padrão de record detail em três colunas, preservando os fluxos ricos já existentes da conta.

---

## O que foi feito

### 1. Layout em três colunas

- Header com nome da empresa, sinal de compra, segmento, cidade e quick actions.
- Sidebar esquerda:
  - Pessoas-chave da empresa, com navegação para `/crm/contatos/:id`.
  - Deals da conta, com navegação para `/crm/negocios/:id`.
- Centro:
  - Aba `Timeline` com `<ActivityTimeline companyId={id} />`.
  - Aba `Lançamentos` preservando `LaunchCard` e `LaunchForm`.
  - Aba `Sinais` listando `account_signals` e mantendo `SignalManager`.
  - Aba `Cadência` preservando `CadenceTimeline`.
  - Aba `Conversa WhatsApp` preservando `WhatsAppTimeline`.
  - Aba `Interações (legacy)` preservando `InteractionFeed`.
- Sidebar direita:
  - Propriedades read-only da empresa.
  - Links externos e automações admin.

### 2. Quick actions

- `Nota`: abre textarea inline e cria `activity kind='note'` com `company_id`.
- `Contato`: abre `ContactForm` com `defaultCompanyId`.
- `Deal`: abre `DealForm` com `defaultCompanyId`.
- `Sinais`: abre o `SignalManager`.

### 3. ActivityTimeline melhorado

Foram integrados os componentes feitos na tarefa Gemini:

- `ActivitySkeleton`
- `ActivityEmptyState`

`ActivityTimeline` agora aceita `onAddNote`, usado pela CompanyDetail para abrir o mesmo editor de nota quando a timeline está vazia.

---

## O que rodar no Supabase

**Nada.** Phase 1D não adiciona migration.

---

## Como testar

1. Abrir `/crm/empresas/<company-id>`.
2. Confirmar header + três colunas em desktop e layout empilhado em telas menores.
3. Verificar abas:
   - Timeline mostra activities da empresa.
   - Lançamentos continua exibindo e editando lançamentos.
   - Sinais lista sinais e abre o gerenciador.
   - Cadência preserva fluxo existente.
   - Conversa WhatsApp preserva o histórico.
   - Interações legacy continua disponível.
4. Adicionar nota e confirmar row em `public.activities` com `company_id`.
5. Clicar em contato/deal nas sidebars e confirmar navegação.

---

## Verificação local feita

- [x] `npx tsc --noEmit`
- [x] `node --check extension/*.js extension/lib/*.js`
- [ ] Teste manual em browser com dados reais.

---

## Limites conhecidos

- Propriedades seguem read-only. Inline edit fica para a Phase 1G.
- Call/task/deal modals completos ficam para a Phase 1F, embora o `DealForm` existente já seja reaproveitado para criar deal ligado à empresa.
