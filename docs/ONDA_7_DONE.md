# Onda 7 — Settings no-code

Settings operacional para admins ajustarem o CRM sem dev e para usuarios manterem templates proprios.

---

## O que foi feito

### 1. Settings Page

[`src/pages/Settings.tsx`](../src/pages/Settings.tsx)

- Nova rota `/settings` com tabs por hash:
  - `/settings#users`
  - `/settings#pipelines`
  - `/settings#custom-fields`
  - `/settings#templates`
- Tabs admin-only bloqueadas para nao-admins.
- Aba Templates disponivel para todos os usuarios autenticados.

### 2. Gestao de usuarios

- Lista `profiles` com nome, email, role e status ativo/inativo.
- Role editavel: `admin`, `manager`, `rep`, `viewer`.
- Invite user cria uma entrada em `profiles` com email + role.
- Desativacao via `is_active`.

### 3. Pipelines e stages

- CRUD de funis usando `funnelService.ts`.
- CRUD de stages dentro do funil selecionado.
- Reordenacao drag-and-drop via `@dnd-kit/sortable`.
- Cor opcional por stage.

### 4. Custom fields

Migration [`supabase/migrations/20260425_custom_fields.sql`](../supabase/migrations/20260425_custom_fields.sql)

- Cria `custom_fields`.
- Adiciona `custom_data jsonb` em:
  - `contacts`
  - `companies`
  - `deals`
- Tipos suportados:
  - `text`
  - `number`
  - `date`
  - `enum`
  - `boolean`
- Reordenacao por entidade.
- RLS com leitura autenticada e escrita admin-only.

### 5. Templates de mensagem

Migration [`supabase/migrations/20260425_message_templates.sql`](../supabase/migrations/20260425_message_templates.sql)

- Cria `message_templates`.
- Canais:
  - `whatsapp`
  - `email`
  - `linkedin`
- Variaveis detectadas por `{{variavel}}`.
- Preview com dados dummy.
- RLS por owner ou admin.

### 6. Service layer

[`src/services/settingsService.ts`](../src/services/settingsService.ts)

- CRUD de profiles para Settings.
- CRUD de custom fields.
- CRUD de message templates.
- Helpers de variaveis e preview.

---

## O que rodar no Supabase

Rodar as migrations em ordem:

```sql
-- supabase/migrations/20260425_custom_fields.sql
-- supabase/migrations/20260425_message_templates.sql
```

Observacao: o invite sem auth pressupoe que a tabela `profiles` aceite registros pendentes sem usuario em `auth.users`, conforme especificado para a Onda 7. Se algum ambiente antigo ainda tiver FK rigida `profiles.id -> auth.users.id`, o invite vai exigir uma migracao de modelo de usuarios pendentes antes de funcionar.

---

## Como testar

1. Abrir `/settings#users` como admin.
2. Alterar role de um usuario e alternar ativo/inativo.
3. Criar um invite com email + role.
4. Abrir `/settings#pipelines`, criar pipeline, criar stages e arrastar para reordenar.
5. Abrir `/settings#custom-fields`, criar campos para contacts/companies/deals e reordenar.
6. Abrir `/settings#templates`, criar template com `{{nome}}` e `{{empresa}}`, conferir variaveis e preview.
7. Entrar como usuario nao-admin e confirmar bloqueio das tabs admin-only, mantendo Templates acessivel.

---

## Verificacao

- [x] `npx tsc --noEmit --pretty false` passa.
- [x] `npm run build` passa.
- [x] `npm run lint` passa sem erros (mantem warnings antigos de Fast Refresh em arquivos fora da Onda 7).
- [x] Extensao Chrome nao foi alterada.

---

## Proximo

Conectar `custom_fields` nas listas, detail pages e importacao CSV para cumprir o criterio final de aparecer em todos os pontos operacionais.
