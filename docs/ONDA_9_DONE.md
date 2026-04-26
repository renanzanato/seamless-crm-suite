# Onda 9 — Email Integration (OAuth Gmail/Outlook + Tracking)

Integração real de email com OAuth, envio via provider, tracking de opens/clicks e fallback Resend.

---

## O que foi feito

### 1. Schema (`20260425_email_integration.sql`)
- `email_accounts` — armazena tokens OAuth por usuário (Gmail/Outlook). RLS owner-based.
- `email_tracking` — tracking de envios com `opened_at`, `clicked_at`, `replied_at`. RLS team-wide read.

### 2. Service (`src/services/emailService.ts`)
- `getMyEmailAccounts()` — lista contas do user (sem expor tokens).
- `disconnectEmailAccount()` / `deleteEmailAccount()` — gestão de contas.
- `getGmailOAuthUrl()` / `getOutlookOAuthUrl()` — URLs pro flow OAuth.
- `sendEmail()` — envia via Edge Function `send-email`.
- `getEmailTrackingForContact()` — histórico de tracking por contato.

### 3. EmailComposeModal (`src/components/email/EmailComposeModal.tsx`)
- Modal com: seletor de conta (from), to, subject, body.
- Empty state quando sem contas conectadas.
- Pronto pra integrar em ContactDetail via botão "Email".

### 4. Edge Functions
- **`oauth-callback`** — recebe redirect do Google/Microsoft, troca code por tokens, salva em `email_accounts`.
- **`send-email`** — envia via Gmail API (RFC 5322 raw) ou Microsoft Graph. Refresh automático de tokens. Injeta pixel + wraps links. Cria `email_tracking` + `activity kind='email'`. Fallback para Resend se sem conta OAuth.
- **`email-pixel`** — retorna PNG 1x1 transparente, marca `opened_at` no tracking.
- **`email-redirect`** — loga click em `clicked_at`, 302 redirect pro URL original.

---

## Variáveis de ambiente necessárias

```env
# Gmail OAuth
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=https://<project>.supabase.co/functions/v1/oauth-callback

# Outlook OAuth
MICROSOFT_CLIENT_ID=xxx
MICROSOFT_CLIENT_SECRET=xxx
MICROSOFT_REDIRECT_URI=https://<project>.supabase.co/functions/v1/oauth-callback

# Fallback (opcional)
RESEND_API_KEY=re_xxx

# Frontend URL
APP_URL=http://localhost:8080
```

### Setup Google OAuth
1. Vá em https://console.cloud.google.com/apis/credentials
2. Crie OAuth 2.0 Client ID (Web application)
3. Authorized redirect URI: `https://<project>.supabase.co/functions/v1/oauth-callback`
4. Ative Gmail API em APIs & Services

### Setup Microsoft OAuth
1. Vá em https://portal.azure.com → App registrations
2. Crie app, adicione redirect URI
3. Ative permissões: Mail.Send, Mail.Read, User.Read

---

## SQL para rodar

Cole o conteúdo de `supabase/migrations/20260425_email_integration.sql` no SQL Editor do Supabase.

---

## Como testar

1. Rode a migration SQL no Supabase.
2. Configure as env vars nas Edge Functions.
3. Deploy das functions:
   ```bash
   supabase functions deploy oauth-callback
   supabase functions deploy send-email
   supabase functions deploy email-pixel
   supabase functions deploy email-redirect
   ```
4. Em Settings → Email, clique "Conectar Gmail".
5. Após OAuth, a conta aparece na lista.
6. Em ContactDetail, use o botão Email para enviar.

---

## Segurança
- Tokens NUNCA expostos ao frontend — só Edge Functions leem `access_token`/`refresh_token`.
- Pixel/redirect com `no-cache` headers.
- `opened_at`/`clicked_at` só atualizam se null (evita overwrite).
