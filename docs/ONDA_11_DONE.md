# Onda 11 — Global Search + Polish

Command Palette global (⌘F) com busca cross-entity.

---

## O que foi feito

### 1. Search Service (`searchService.ts`)
- `globalSearch(query)` — queries paralelas em `contacts`, `companies`, `deals` via `ILIKE`.
- Retorna resultados normalizados com `type`, `title`, `subtitle`, `link`.

### 2. CommandPalette (`CommandPalette.tsx`)
- Dialog modal ativado por **⌘F** (ou **Ctrl+F**).
- Campo de busca com debounce natural via react-query `staleTime`.
- Resultados agrupados por tipo (Contatos / Empresas / Negócios).
- Navegação por teclado: ↑↓ para mover, Enter para abrir, Esc para fechar.
- Ícones e cores por tipo de entidade.
- Footer com hints de atalhos.

### 3. Integração
- `DashboardLayout.tsx` renderiza `<CommandPalette />` globalmente.
- O campo de busca no TopBar continua visível (estático), mas ⌘F abre o palette real.

---

## Como testar

1. Abra o CRM.
2. Pressione **⌘F** (Mac) ou **Ctrl+F** (Windows).
3. Digite 2+ caracteres e veja os resultados de contatos, empresas e negócios.
4. Use ↑↓ Enter para navegar.
