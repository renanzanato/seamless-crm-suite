# Tarefas Gemini (Antigravity)

Tarefas pequenas, isoladas, com spec cirúrgico. Pode rodar em paralelo com qualquer phase do Codex **desde que cada tarefa crie arquivos novos e não modifique os que o Codex está tocando no momento**.

> **Regra de ouro**: antes de enviar uma tarefa pro Gemini, confira qual phase o Codex está executando. Se ele está na Phase 1D (CompanyDetail), qualquer coisa fora de `src/pages/crm/CompanyDetail.tsx` é seguro.

---

## Task G-1 — Loading skeleton pra ActivityTimeline

**Por que**: hoje `ActivityTimeline.tsx` mostra só um `<Loader2>` spinner enquanto carrega. UX ruim; melhor um skeleton pulsante estilo LinkedIn que dá sensação de velocidade.

**Prompt pra colar no Antigravity**:

```
Crie um componente React em TypeScript em
src/components/activities/ActivitySkeleton.tsx

Regras:
- Usa Tailwind CSS (animate-pulse, bg-muted, rounded-md, h-*, w-*).
- Usa cn() de @/lib/utils.
- Exporta função `ActivitySkeleton({ count?: number })`. Default count=5.
- Renderiza N "ghost items" com a mesma estrutura visual do ItemShell
  em src/components/activities/TimelineItems.tsx:
    - Um círculo (h-8 w-8 rounded-full) à esquerda
    - Um card à direita (border, bg-card, rounded-md, p-3) com:
      - Linha título (h-3.5 w-40 bg-muted rounded)
      - Linha subtítulo menor (h-2.5 w-24 bg-muted/60 rounded, mt-1)
      - Bloco body (2 linhas h-3 w-full, mt-2)
- Espaçamento vertical entre ghost items: mb-3.
- Todos os elementos cinzas usam `animate-pulse`.
- Sem props além de `count`.
- TSC strict limpo.

Depois de criar, me devolve o código completo e nada mais.
```

**Onde aplicar o resultado depois**: editar `ActivityTimeline.tsx` substituindo o bloco `{isLoading && <Loader2 ... />}` por `{isLoading && <ActivitySkeleton />}`. Essa edição é de 3 linhas, eu faço depois que Gemini entregar.

---

## Task G-2 — Empty state visual pra timeline

**Por que**: hoje o empty state é só ícone `Inbox` + texto. Poderia ter uma ilustração de bullet point ou um CTA claro.

**Prompt pra colar no Antigravity**:

```
Crie um componente React em TypeScript em
src/components/activities/ActivityEmptyState.tsx

Regras:
- Usa Tailwind CSS.
- Usa cn() de @/lib/utils.
- Import ícones de lucide-react.
- Exporta função `ActivityEmptyState({ hint, onAddNote })` com:
    hint: string (obrigatório, mensagem principal)
    onAddNote?: () => void (opcional, callback do botão CTA)

Estrutura visual:
- Container centralizado vertical (flex flex-col items-center justify-center text-center gap-3 min-h-[240px]).
- Ícone grande (64x64px) em círculo com fundo bg-primary/5 e text-primary/60. Usa `MessageSquare` de lucide-react.
- Título h3 "Nada por aqui ainda" (text-base font-semibold).
- Texto secundário com o conteúdo de `hint` (text-sm text-muted-foreground max-w-sm).
- Se onAddNote for passado, mostra um <Button variant="outline" size="sm"> com ícone
  <StickyNote /> e texto "Adicionar primeira nota" que chama onAddNote ao clicar.

Requisitos:
- Usa Button de @/components/ui/button.
- TSC strict limpo.
- Sem props além de hint e onAddNote.

Devolve o código completo.
```

**Onde aplicar depois**: substituir o empty state do `ActivityTimeline.tsx` pelo componente novo, passando `hint={emptyHint}` e `onAddNote={...}` se tivermos handler.

---

## Checklist de segurança antes de colar

- [ ] Phase corrente do Codex NÃO está tocando os arquivos que a task Gemini vai criar/modificar.
- [ ] Tarefa Gemini cria **arquivo novo** (não modifica existente).
- [ ] Spec é cirúrgico: estrutura, classes, props, nomes — tudo explícito.
- [ ] Depois de Gemini entregar, Claude (eu) faz review e integra.

---

## Antipadrões (não mande isso pro Gemini)

- "Melhora o ContactDetail" — vago, multi-arquivo, alta chance de contradizer o Codex.
- "Refatora o WhatsAppTimeline pra ser mais limpo" — grande, raciocínio arquitetural, não é o forte dele.
- "Adiciona testes E2E" — precisa de contexto do projeto inteiro, melhor Codex/Claude.
- "Cria uma migration SQL" — Gemini erra sintaxe Postgres com frequência. Deixa pro Codex.
