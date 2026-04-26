# Onda 10 — Notifications + Mentions

Sistema de notificações in-app com auto-geração via triggers e suporte a menções em notas.

---

## O que foi feito

### 1. Schema (`20260425_notifications.sql`)
- **`notifications`** — tabela com `kind`, `title`, `body`, `link`, `read_at`. Tipos: `mention`, `lead_replied`, `task_due_soon`, `sequence_replied`, `deal_stage_change`, `signal_hot`, `system`.
- **`notification_preferences`** — preferências por tipo (in_app + email). Unique per user+kind.
- **RLS** — owner-based (user vê somente suas notificações).

### 2. Triggers automáticos
- **`fn_notify_on_activity`** — dispara em INSERT na `activities`. Notifica o dono do contato quando:
  - Lead responde (inbound whatsapp/email)
  - Deal muda de estágio
- **`fn_notify_mentions`** — quando uma nota com `payload.mentions` (array de UUIDs) é criada, gera notificação `mention` para cada mencionado.

### 3. Service (`notificationsService.ts`)
- `getNotifications()`, `getUnreadCount()`, `markAsRead()`, `markAllAsRead()`
- `getPreferences()`, `upsertPreference()` — gestão de preferências

### 4. NotificationBell (`NotificationBell.tsx`)
- Ícone de sino no TopBar com badge de unread count
- Popover com lista scrollável de notificações
- Ícone e cor por tipo de notificação
- Tempo relativo (agora, 5min, 2h, 3d)
- Mark as read on click, "Marcar todas" button
- Polling a cada 30s

### 5. Integração
- `TopBar.tsx` atualizado — sino estático substituído pelo `NotificationBell` real

---

## SQL para rodar

Cole `supabase/migrations/20260425_notifications.sql` no SQL Editor do Supabase.

---

## Como testar

1. Rode a migration no Supabase.
2. Crie uma atividade inbound (WhatsApp/email) com `direction='in'` — deve gerar notificação pro owner do contato.
3. Crie uma nota com `payload: { mentions: ["uuid-do-user"] }` — deve gerar notificação de menção.
4. O sino no header mostra o badge vermelho com count.
