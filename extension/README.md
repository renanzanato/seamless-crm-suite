# Pipa Driven — Extensão Chrome

Espelho bidirecional WhatsApp Web ↔ CRM Pipa Driven.

## Instalar em modo dev

1. `cd extension && npm install && npm run build`
2. Abrir `chrome://extensions/` → "Carregar sem compactação"
3. Selecionar a pasta `extension/`

## Estrutura

- `src/content.ts`       — captura de mensagens do WhatsApp Web
- `src/background.ts`    — service worker + polling da outbox
- `src/popup/`           — UI do popup da extensão
- `src/services/`        — cliente Supabase, helpers
- `src/types/`           — tipos TypeScript
