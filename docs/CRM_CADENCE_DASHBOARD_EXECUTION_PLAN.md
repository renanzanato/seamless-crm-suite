# Plano de Execucao: Cadencias, Integracao e Painel Simples

## Objetivo

Agora que o espelhamento do WhatsApp voltou a funcionar, a proxima fase e deixar o CRM menos fragmentado e mais operacional:

1. Corrigir bugs de integracao que aparecem ao reiniciar ou trocar de tela.
2. Fazer a area de sequencias virar um builder visual estilo Go High Level.
3. Fazer cadencias com variaveis dinamicas confiaveis: contato, empresa e empreendimento.
4. Simplificar o Painel para responder: o que preciso fazer hoje, nesta semana, e quanto falta para bater a meta.

O foco nao e IA ainda. O foco e rotina comercial funcionando.

## Diagnostico Atual

### O que ja existe

- `SequenceBuilderV2` ja usa ReactFlow e tem nodes de email, WhatsApp, ligacao, LinkedIn, espera e condicao.
- `sequence_steps_v2` e `sequence_step_runs` ja existem como base tecnica.
- `sequence-worker-v2` ja executa parte do motor.
- `HojePage` ja mostra tarefas operacionais do dia.
- `Index.tsx` ja tem um Painel com abas Resumo, GTM e Vendas.

### O que ainda nao esta 100%

- O builder visual ainda e mais uma lista vertical desenhada do que um workflow real.
- As conexoes do ReactFlow nao parecem persistidas como logica executavel.
- Condicoes como "respondeu?", "abriu email?", "marcou reuniao?" ainda precisam virar regra real no worker.
- Templates tem placeholder no texto, mas falta um renderizador unico e validado.
- O worker e a UI ainda precisam falar o mesmo contrato sobre steps, edges, status e variaveis.
- O Painel GTM esta sofisticado demais para a fase atual e ainda consulta partes legadas como `interactions` e `deals.stage`, enquanto o CRM esta migrando para `activities` e `stage_id`.
- Ha uma alteracao local em `supabase/migrations/20260425_sequence_worker_support.sql` que torna o trigger defensivo para `deals.stage` ou `deals.stage_id`. Tratar como ajuste importante, mas revisar antes de commit.
- `supabase/whatsapp_wipe.sql` continua fora do fluxo normal e nao deve entrar em commit/deploy.

## Modelo De Produto

### Sequencia

Uma sequencia e um workflow com:

- Nome.
- Canal principal: WhatsApp, email ou ambos.
- Configuracoes globais:
  - parar quando responder;
  - respeitar horario comercial;
  - limite diario de enrollments;
  - owner padrao.
- Nodes conectados:
  - enviar email automatico;
  - criar tarefa de email manual;
  - criar tarefa de WhatsApp;
  - criar tarefa de ligacao;
  - criar tarefa de LinkedIn;
  - aguardar X dias;
  - condicao;
  - fim.

### Variaveis dinamicas

Padrao unico recomendado:

```txt
{{contact.name}}
{{contact.first_name}}
{{contact.email}}
{{contact.whatsapp}}
{{contact.role}}
{{company.name}}
{{company.domain}}
{{company.city}}
{{company.industry}}
{{company.custom.nome_empreendimento}}
{{deal.title}}
{{deal.value}}
{{owner.name}}
```

Aliases em portugues podem existir, mas devem compilar para esse contrato:

```txt
{{nome}} -> {{contact.first_name}}
{{empresa}} -> {{company.name}}
{{empreendimento}} -> {{company.custom.nome_empreendimento}}
```

## Ondas De Execucao

## Onda A: Auditoria De Bugs De Integracao

Objetivo: parar os bugs de "reiniciar e quebrar".

Escopo:

- Revisar rotas que carregam dados legados:
  - `Index.tsx`
  - `HojePage.tsx`
  - `SequenciasPage.tsx`
  - `SequenceBuilderV2.tsx`
  - `CompanyDetail.tsx`
  - `DealDetail.tsx`
- Corrigir consultas que ainda dependem de:
  - `interactions` quando deveriam usar `activities`;
  - `deals.stage` quando o schema usa `stage_id`;
  - arrays de contatos em payload quando o schema operacional usa `contact_id`;
  - tabelas opcionais sem fallback.
- Adicionar estados de erro claros em telas criticas.
- Garantir cleanup de subscriptions Supabase em unmount.
- Rodar `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run test`.

Arquivos provaveis:

- `src/services/gtmMetricsService.ts`
- `src/services/inboxService.ts`
- `src/services/sequencesV2Service.ts`
- `src/pages/Index.tsx`
- `src/pages/HojePage.tsx`
- `src/pages/SequenceBuilderV2.tsx`
- `supabase/migrations/20260425_sequence_worker_support.sql`

Pronto quando:

- Reload em Painel, Hoje e Sequencias nao quebra.
- Query que falha por schema opcional vira dado vazio, nao tela quebrada.
- Build e typecheck passam.

## Onda B: Builder Visual Real De Sequencias

Objetivo: transformar o builder em workflow conectavel de verdade.

Escopo:

- Persistir `nodes` e `edges`, nao apenas steps ordenados por posicao Y.
- Criar ou ampliar schema:
  - `sequence_flow_nodes`
  - `sequence_flow_edges`
  - ou adicionar `next_step_id`, `true_step_id`, `false_step_id` em `sequence_steps_v2`.
- Definir step inicial.
- Permitir branch condicional:
  - respondeu;
  - abriu email;
  - clicou;
  - marcou reuniao;
  - tem campo preenchido;
  - lifecycle_stage mudou.
- Adicionar node "Fim".
- Bloquear save se o workflow estiver invalido:
  - sem start;
  - node solto;
  - condicao sem saida sim/nao;
  - loop infinito;
  - template com variavel invalida.

Arquivos provaveis:

- `src/pages/SequenceBuilderV2.tsx`
- `src/components/sequence-builder/StepNode.tsx`
- `src/components/sequence-builder/StepConfigPanel.tsx`
- `src/components/sequence-builder/StepPalette.tsx`
- `src/services/sequencesV2Service.ts`
- nova migration `supabase/migrations/YYYYMMDD_sequence_flow_graph.sql`

Pronto quando:

- Usuario cria fluxo visual com branch.
- Salva, sai da tela, volta e o desenho aparece igual.
- Worker consegue descobrir qual e o proximo node.

## Onda C: Motor De Variaveis E Preview

Objetivo: toda mensagem renderizar certo antes de enviar/criar tarefa.

Escopo:

- Criar `templateRenderer` unico no frontend e, se possivel, espelhar no worker.
- Resolver aliases:
  - `{{nome}}`
  - `{{empresa}}`
  - `{{empreendimento}}`
- Preview por contato selecionado.
- Destacar variaveis invalidas no editor.
- Fallback seguro:
  - se `empreendimento` nao existir, mostrar aviso e bloquear envio automatico ou pedir confirmacao;
  - nunca enviar `{{variavel}}` cru.
- Registrar no activity payload:
  - template original;
  - body renderizado;
  - variaveis usadas;
  - variaveis faltantes.

Arquivos provaveis:

- `src/lib/templateRenderer.ts`
- `src/components/sequence-builder/StepConfigPanel.tsx`
- `src/services/sequencesV2Service.ts`
- `supabase/functions/sequence-worker-v2/index.ts`
- `supabase/functions/send-email/index.ts`

Pronto quando:

- Uma mensagem "Oi {{nome}}, vi a {{empresa}} no {{empreendimento}}" vira texto correto no preview e na task.
- Variavel errada aparece como erro antes de salvar.
- Worker e UI renderizam igual.

## Onda D: Enrollment E Execucao Da Cadencia

Objetivo: colocar contatos/companhias na cadencia e acompanhar execucao.

Escopo:

- Enrollar por:
  - contato individual;
  - empresa com N contatos;
  - lista salva.
- Criar tela/modal "Adicionar a cadencia".
- Garantir que a cadencia puxe:
  - contato;
  - company;
  - empreendimento em custom props ou campo dedicado;
  - owner.
- Worker executa nodes:
  - email automatico envia;
  - WhatsApp cria tarefa para a extensao ou fila operacional;
  - call/linkedin criam tarefa;
  - wait agenda proxima execucao;
  - condition escolhe proximo edge.
- Parar automaticamente quando houver resposta inbound em `activities`.

Arquivos provaveis:

- `src/components/lists/BulkActions.tsx`
- `src/pages/crm/ContactDetail.tsx`
- `src/pages/crm/CompanyDetail.tsx`
- `src/services/sequencesV2Service.ts`
- `src/services/inboxService.ts`
- `supabase/functions/sequence-worker-v2/index.ts`
- nova migration para indices/status se faltar.

Pronto quando:

- Coloco uma company na cadencia.
- O CRM cria tarefas/mensagens do dia.
- Resposta inbound para a cadencia.
- Timeline mostra enrollment, step executado, resposta e unenroll.

## Onda E: Painel Simples De Meta E Rotina

Objetivo: substituir o Painel GTM complexo por um painel operacional simples.

Nova tela "Painel" deve responder:

1. O que tenho que fazer hoje?
2. O que preciso bater nesta semana?
3. Quanto falta para a meta do mes?
4. Quais deals estao travados?
5. Quais respostas novas exigem acao?

Estrutura recomendada:

- Bloco 1: Hoje
  - tarefas atrasadas;
  - tarefas de hoje;
  - respostas sem follow-up;
  - proximas acoes de cadencia.
- Bloco 2: Semana
  - meta semanal;
  - realizado;
  - faltante;
  - forcado por dia util restante.
- Bloco 3: Mes
  - reunioes;
  - propostas;
  - contratos;
  - MRR ou valor vendido;
  - pipeline aberto.
- Bloco 4: Travamentos
  - deals parados ha X dias;
  - cadencias com erro;
  - contatos sem company;
  - companies sem contatos.

Cortar por enquanto:

- Narrativa pesada de engenharia reversa.
- Textos longos de GTM.
- Abas GTM/Vendas se elas nao ajudam a decidir acao hoje.
- Cards de vanity metric sem acao.

Arquivos provaveis:

- `src/pages/Index.tsx`
- `src/services/gtmMetricsService.ts`, talvez renomear depois para `dashboardService.ts`
- `src/components/dashboard/GoalProgressBoard.tsx`
- `src/components/dashboard/ExecutiveSnapshotGrid.tsx`
- `src/components/dashboard/PipelineStageBoard.tsx`

Pronto quando:

- Ao abrir o app, fica claro o que fazer no dia.
- A meta da semana e do mes tem "faltam X" e "precisa fazer Y por dia".
- Cada card importante tem link para Hoje, Deals, Contatos ou Sequencias.

## Onda F: QA Operacional

Objetivo: garantir que o CRM nao volte a fragmentar.

Smoke tests manuais:

1. Recarregar Painel.
2. Recarregar Hoje.
3. Recarregar Sequencias.
4. Criar sequencia visual com branch.
5. Salvar e reabrir sequencia.
6. Enrollar contato.
7. Rodar worker.
8. Ver tarefa em Hoje.
9. Registrar resposta inbound.
10. Confirmar unenroll e timeline.

Checks tecnicos:

```bash
npm run lint
npx tsc --noEmit
npm run build
npm run test
```

## Divisao Sugerida Para Codexes

### Codex 1: Auditoria De Bugs

Responsavel por Onda A.

Entrega:

- Corrigir queries quebradas por schema drift.
- Resolver bug de reload/restart.
- Nao mexer no builder visual alem do necessario para nao quebrar.

### Codex 2: Builder Visual

Responsavel por Onda B.

Entrega:

- Persistencia real de nodes/edges.
- Validacao de workflow.
- UI mais parecida com Go High Level.

### Codex 3: Variaveis E Worker

Responsavel por Onda C e parte da Onda D.

Entrega:

- Renderizador de template.
- Preview.
- Worker usando variaveis e edges.
- Stop on reply.

### Codex 4: Painel Simples

Responsavel por Onda E.

Entrega:

- Refazer Painel para rotina e meta.
- Remover excesso de GTM/engenharia reversa.
- Conectar cards a acoes reais.

## Ordem Recomendada

1. Onda A primeiro, porque bugs de integracao contaminam tudo.
2. Onda B e C podem rodar em paralelo depois que A estiver verde.
3. Onda D depende de B e C.
4. Onda E pode rodar em paralelo com B/C, desde que use services proprios.
5. Onda F fecha antes de deploy.

## Guardrails

- Nao commitar `supabase/whatsapp_wipe.sql`.
- Nao rodar SQL destrutivo em producao.
- Migrations sempre idempotentes.
- Manter `sequence_steps` legado ate tudo estar migrado para V2.
- Nao introduzir IA nesta fase.
- Nao transformar o CRM em suite gigante; primeiro rotina, cadencia, deals e metas.
