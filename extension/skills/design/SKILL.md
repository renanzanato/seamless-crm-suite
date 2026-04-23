---
name: pipa-extension-design
description: Design skill canônica da extensão Pipa Driven. Invoque SEMPRE antes de gerar qualquer HTML/CSS/JSX de UI da extensão. Consolida tokens, componentes, regras e checklist de review para manter identidade visual consistente com o CRM.
---

# Pipa Driven Extension — Design Skill

> Design skill no estilo Claude (invocável). Quando estiver gerando qualquer UI desta extensão — sidebar injetada no WhatsApp Web, popup, página de configuração — **leia este arquivo primeiro** e siga o checklist no final antes de considerar a tela pronta.

---

## Quando invocar

- Antes de gerar qualquer componente novo (sidebar, card, formulário, modal)
- Antes de editar CSS/Tailwind que afete aparência
- Ao receber feedback do tipo "tá feio", "melhora o visual", "ajusta o layout"

**Não invocar para:** lógica pura (service, util, types), migração SQL, Edge Function sem UI.

---

## 1. Fonte canônica

**O design system mestre do projeto é** [`../../DESIGN_SYSTEM.md`](../../../DESIGN_SYSTEM.md) (no CRM). Tokens, paleta, tipografia e componentes vêm de lá. Este arquivo aqui **estende** — nunca contradiz.

Se houver conflito: vale o DESIGN_SYSTEM.md do CRM. Se precisar mudar token, mude lá primeiro.

---

## 2. Identidade visual (resumo executável)

### Princípios não-negociáveis
1. **Dark por padrão.** Fundo `#0A0A0A`. Nunca branco puro. Nunca `bg-white`.
2. **Laranja é sinal, não decoração.** `#F97316` só em: CTA primário, estado ativo, logo Pipa. Nunca em bordas decorativas, gradient de fundo, ou "destaques" genéricos.
3. **Bordas sutis separam, sombras não.** Usar `1px solid #242424` em vez de `box-shadow`.
4. **Densidade informacional alta, mas respirando.** Padding interno ≥ 12px, line-height 1.5, espaçamento vertical entre seções ≥ 20px.
5. **Tipografia via peso e opacidade, não cor.** Hierarquia sai de `font-weight` + `color: #EBEBEB / #A0A0A0 / #606060`, não de cores arbitrárias.
6. **Ícones Lucide, stroke 1.5, tamanho 16px ou 20px.** Nunca outros icon packs, nunca emojis em UI funcional.

### Paleta mínima (cola rápida)
```
--bg-base       #0A0A0A    fundo
--bg-card       #141414    cards, painéis
--bg-card-hover #1C1C1C    hover
--bg-elevated   #202020    dropdowns, tooltip
--bg-input      #181818    inputs
--border-subtle #242424    separadores
--border-default #2E2E2E   bordas de input
--border-strong  #404040   focus, hover forte
--text-primary   #EBEBEB   título / label principal
--text-secondary #A0A0A0   descrição / meta
--text-muted     #606060   placeholder / disabled
--pipa-orange    #F97316   CTA / ativo / brand
--status-success #22C55E   ok
--status-warning #F59E0B   pendente
--status-error   #EF4444   erro
--bubble-out     #1A3329   msg enviada (whatsapp)
--bubble-in      #141428   msg recebida (whatsapp)
```

### Tipografia
- Família: `Inter, system-ui, sans-serif` (em qualquer contexto — popup, sidebar, etc)
- Escala: 9/10/11/13/15/20 (px). Nunca usar outros tamanhos.
- Títulos: `15px/600`. Corpo: `13px/400`. Meta: `10–11px/500`.

### Espaçamento
Múltiplos de 4px: 4, 8, 12, 16, 20, 24, 32. Se estiver tentando usar 7 ou 13, pare — escolha o mais próximo do múltiplo.

---

## 3. Referência de layout — filho estético do CRM + inspirado em WZap Business

### CRM Pipa Driven (identidade-pai)
Herdamos do CRM: paleta, tipografia, componentes (Card, Badge, Input, Button), sensação de "densidade inteligente".

### WZap Business (inspiração funcional, NÃO estética)
A imagem de referência que o Renan mandou mostra:
- Sidebar vertical esquerda com ícones (inbox, campanhas, calendário, contatos, bot, etc)
- Painel central de chat
- **Cortamos tudo de:** banner "Comprar Premium", "Assinatura Vencida", qualquer CTA de monetização. A extensão é interna.

**Pegamos a estrutura, não o estilo.** WZap é verde-claro-chato. A gente é dark-pipa.

---

## 4. Componentes canônicos (prontos pra copiar)

### Botão primário (CTA)
```tsx
<button
  className="btn-primary"
  style={{
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: '#F97316', color: '#0A0A0A',
    fontSize: 13, fontWeight: 600,
    padding: '8px 16px', borderRadius: 8,
    border: 'none', cursor: 'pointer',
  }}
>
  Enviar
</button>
```

### Botão secundário (ação alternativa)
```tsx
<button style={{
  background: 'transparent', color: '#A0A0A0',
  border: '1px solid #2E2E2E',
  fontSize: 13, fontWeight: 500,
  padding: '8px 16px', borderRadius: 8,
  cursor: 'pointer',
}}>Cancelar</button>
```

### Botão ghost (ícone só)
```tsx
<button style={{
  background: 'transparent', border: 'none',
  color: '#606060', padding: 6, borderRadius: 6,
  cursor: 'pointer',
}}>
  <X size={16} />
</button>
```

### Input
```tsx
<input style={{
  width: '100%',
  background: '#181818', border: '1px solid #2E2E2E',
  borderRadius: 8, padding: '8px 12px',
  fontSize: 13, color: '#EBEBEB', outline: 'none',
}} />
```
Focus: `border-color: #F97316` + `box-shadow: 0 0 0 3px #F9731615`.

### Card
```tsx
<div style={{
  background: '#141414', border: '1px solid #242424',
  borderRadius: 10, padding: 16,
}} />
```
Hover (se interativo): `border-color: #2E2E2E` + `background: #1C1C1C`.

### Badge
```tsx
// verde (ok), amarelo (pendente), vermelho (erro), laranja (brand)
<span style={{
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '2px 8px', borderRadius: 100,
  fontSize: 10, fontWeight: 600, letterSpacing: '0.02em',
  background: '#22C55E18', color: '#22C55E',
}}>Ativo</span>
```

### Status dot (pulsante)
```tsx
<span style={{
  width: 8, height: 8, borderRadius: '50%',
  background: '#22C55E',
  boxShadow: '0 0 0 0 #22C55E40',
  animation: 'pulse-green 2s infinite',
}} />
```

### Bolha de chat (WhatsApp)
Out: `background: #1A3329, border: 1px solid #2D4A3E, borderRadius: 16px 4px 16px 16px` (cauda à direita).
In:  `background: #141428, border: 1px solid #1E1E3A, borderRadius: 4px 16px 16px 16px` (cauda à esquerda).

---

## 5. Layouts específicos da extensão

### Sidebar injetada no WhatsApp Web
- Largura fixa: `320px`
- Posição: `right: 0, top: 0, bottom: 0, position: fixed`
- z-index: 9999 (acima do WhatsApp mas abaixo de tooltip do Chrome)
- Background: `#0A0A0A`, border-left: `1px solid #242424`
- Empurra o DOM nativo: ajustar `body { margin-right: 320px }` OU usar `position: fixed` e aceitar sobreposição (preferir empurrar)
- Estrutura: header 48px (logo Pipa + botão minimizar) → tabs horizontal (Contexto / Regras / IA / Métricas) → conteúdo rolável

### Popup da extensão (clique no ícone)
- Largura: `340px`, altura: conteúdo (max `600px`, scroll)
- Header 40px com logo Pipa + status dot
- Stats em grid 2×2 (hoje, semana, mês, total)
- Lista de chats ativos (máx 5 visíveis, scroll)
- Botão "Abrir CRM" full-width no bottom

### Sidebar vertical de ações (dentro da sidebar Pipa)
Opcional Fase 3+: barra lateral interna de 48px com ícones verticais (Inbox, Regras, IA, Contatos, Métricas), estilo WZap mas dark-Pipa. Ícone ativo tem background `#F9731620` e cor `#F97316`.

---

## 6. Anti-patterns (o que NUNCA fazer)

- ❌ `bg-white`, `text-black`, ou qualquer cor HSL/RGB fora da paleta. Sempre hex da tabela.
- ❌ `box-shadow` pesado tipo `0 10px 30px rgba(0,0,0,0.5)`. Usa borda sutil.
- ❌ Border radius > 16px. Máximo: botão 8px, card 10px, badge 100px (pill).
- ❌ Emoji em labels funcionais (👥, 📱, ✅). Usa Lucide. Emoji só em conteúdo do usuário.
- ❌ Gradient de fundo. Em nenhuma hipótese.
- ❌ Animações > 300ms. Transições rápidas: 120–200ms. Loading: `animate-spin` do Lucide.
- ❌ Texto uppercase exceto labels micro (9–10px, `letter-spacing: 0.08em`).
- ❌ Mais de 3 pesos de fonte por tela (400, 500, 600). Nunca 700+ (dark mode pesado mata legibilidade).
- ❌ Cor diferente para "enfatizar". Use peso ou opacidade.
- ❌ Copiar elementos monetários do WZap Business (banners "Premium", CTAs de upgrade). Produto interno.
- ❌ Botão primário em mais de 1 lugar por tela. Uma ação primária por contexto.

---

## 7. Checklist de review (antes de dar por pronto)

Cole mentalmente antes de entregar qualquer UI:

**Cores**
- [ ] Nenhum branco puro ou cinza fora da paleta
- [ ] Laranja só em CTA/ativo/brand
- [ ] Status (verde/amarelo/vermelho) vem da tabela, não inventado

**Tipografia**
- [ ] Família Inter
- [ ] Só tamanhos da escala (9/10/11/13/15/20)
- [ ] Hierarquia via peso+opacidade, não cor

**Espaçamento**
- [ ] Múltiplos de 4px
- [ ] Padding interno ≥ 12px em containers
- [ ] line-height 1.5 em corpo de texto

**Componentes**
- [ ] Botão primário tem `#F97316` + texto `#0A0A0A`
- [ ] Card usa `#141414` + border `#242424`
- [ ] Input usa `#181818` + border `#2E2E2E`
- [ ] Focus state em inputs mostra laranja

**Anti-patterns**
- [ ] Zero `box-shadow` pesado
- [ ] Zero gradient
- [ ] Zero emoji funcional
- [ ] Nada monetário (premium, assinatura, upgrade)
- [ ] Uma única ação primária por tela

**Integração**
- [ ] Sidebar injetada não quebra layout nativo do WhatsApp
- [ ] Estética consistente com o CRM (mesma paleta, mesma linguagem)
- [ ] Ícones Lucide, stroke consistente

Se qualquer item falhar, **ajuste antes de entregar** — não peça perdão depois.

---

## 8. Exemplos de "antes/depois" conceituais

**Errado (bonito mas fora do sistema):**
```tsx
<button className="bg-gradient-to-r from-orange-400 to-orange-600 text-white shadow-xl rounded-2xl px-6 py-3">
  🚀 Enviar mensagem
</button>
```

**Certo:**
```tsx
<button style={{
  background: '#F97316', color: '#0A0A0A',
  fontSize: 13, fontWeight: 600,
  padding: '8px 16px', borderRadius: 8,
  display: 'inline-flex', alignItems: 'center', gap: 6,
}}>
  <Send size={14} /> Enviar
</button>
```

Diferença: (1) sem gradient, (2) sem emoji, (3) sem sombra, (4) border-radius 8 em vez de 2xl (16), (5) tamanhos da escala.

---

## 9. Quando mudar o sistema

Se precisar de um componente novo que não está aqui:
1. Desenha a intenção primeiro
2. Checa se dá para compor com o que já existe (card+badge+botão resolve 80% dos casos)
3. Se de fato é novo: adiciona em **DESIGN_SYSTEM.md do CRM primeiro**, depois referencia aqui
4. Nunca cria solução "só pra extensão" que diverge do CRM
