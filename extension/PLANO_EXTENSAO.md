# Pipa Driven — Plano da Extensão

> **Doc canônico.** Toda decisão de escopo, arquitetura, design e ordem de execução vive aqui. Quando algo mudar, a gente atualiza este arquivo — não cria um novo.

---

## 1. Visão e Escopo

### O que a extensão É
- **Espelho fiel, bidirecional, entre WhatsApp Web e o CRM Pipa Driven.**
- Ferramenta operacional do vendedor (Renan hoje, time depois): abriu o WhatsApp Web, a extensão entrega tudo que o CRM precisa sem esforço manual.
- Orquestradora de **follow-ups por regra de tempo** ("sem resposta há X min → manda Y").
- Interface de **IA conversacional com RAG** sobre tom de voz + playbook, operando em 2 modos conforme o estágio do lead.
- Painel de **analytics operacional** direto no contexto do chat.

### O que a extensão NÃO é
- Não é um CRM. Pipeline, deals, contatos, cadências multi-step — isso vive no CRM web.
- Não é um produto comercializável. Uso interno, sem tela de assinatura/pagamento/premium.
- Não substitui o WhatsApp Web. Ela convive com a UI nativa — nunca quebra o que já funciona.
- Não faz enriquecimento cosmético (não injeta "assinatura", não prefixa nome, não edita o que você digita).

### Usuário-alvo
Renan (CRO, solo) operando uma conta WhatsApp Business com ~100–300 conversas ativas. Time futuro com até ~5 vendedores compartilhando a mesma base Supabase.

---

## 2. Arquitetura

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  WhatsApp Web    │◀───▶│   Extensão       │◀───▶│    Supabase      │
│  (DOM)           │     │  (content +      │     │  (Postgres +     │
│                  │     │   background +   │     │   Realtime +     │
│                  │     │   popup/sidebar) │     │   Storage +      │
└──────────────────┘     └──────────────────┘     │   Edge Functions)│
                                  ▲                └──────────────────┘
                                  │                         ▲
                                  │                         │
                                  ▼                         ▼
                         ┌──────────────────┐     ┌──────────────────┐
                         │    CRM Web       │     │     LLM API      │
                         │ (seamless-crm-   │     │ (OpenAI/Claude/  │
                         │  suite, React)   │     │  Gemini)         │
                         └──────────────────┘     └──────────────────┘
```

### Componentes da extensão
- **content.ts** — roda dentro do DOM do WhatsApp Web. Observa mutations, captura mensagens, injeta sidebar Pipa.
- **background.ts** (service worker) — polling de outbox + schedules, chama Edge Functions, faz fan-out pra tabs.
- **popup/** — painel rápido (340px) ao clicar no ícone da extensão. Status, stats, link CRM.
- **sidebar/** (injetada no WhatsApp Web) — painel lateral 320px à direita do chat ativo: contexto do lead, sugestões de IA, histórico, ações.

### Fluxos principais
1. **Captura (in)**: DOM → content.ts parseia → upsert em `whatsapp_messages` com `raw_id` único.
2. **Envio (out)**: CRM insere em `whatsapp_outbox` → background polla → content.ts envia pelo DOM → marca `sent`.
3. **Follow-up**: regra cadastrada em `whatsapp_rules` → Edge Function cron → detecta lead ocioso → insere outbox.
4. **IA**: gatilho (novo inbound ou timer) → Edge Function `ai-responder` busca contexto via RAG → gera sugestão → grava em `whatsapp_drafts` OU dispara outbox direto (auto-send em pré-vendas).

---

## 3. Features por Fase

### ✅ Fase 1 — Espelho fiel (inbound)
Captura de todas as mensagens do WhatsApp Web para o Supabase, preservando formatação markdown, autor real, timestamp real, tipo de mídia. Dedup por `raw_id`.

**Critério de pronto:** abrir um chat, mandar 10 mensagens mistas (texto, bold, italic, áudio, imagem, citação) → todas aparecem no CRM com conteúdo 100% fiel.

### ✅ Fase 2 — Envio bidirecional (outbound)
CRM insere mensagem em `whatsapp_outbox`. Extensão polla, abre o chat correspondente, envia via DOM (contenteditable + execCommand), marca como `sent` com o `raw_id` retornado pelo WhatsApp.

**Critério de pronto:** enviar 5 mensagens pelo CRM → 5 entregues no WhatsApp → 5 ecoadas de volta em `whatsapp_messages` com `direction=out` e `raw_id` do WhatsApp.

### 🔲 Fase 3A — Follow-ups por regra de tempo
Cadastro de regras na própria extensão (sidebar direita → aba "Regras"):
- **Gatilho**: "lead sem resposta há X minutos/horas" ou "lead respondeu há X minutos" ou "chat criado há X tempo"
- **Condição**: estágio do lead no pipeline (vem do Supabase, join com `deals`)
- **Ação**: enviar template Y (com variáveis `{nome}`, `{empresa}`, etc)

**Storage:** tabela `whatsapp_rules` + `whatsapp_rule_runs` (auditoria de execução).
**Runner:** Supabase Edge Function com cron a cada 1 min → avalia regras → insere outbox.

**Critério de pronto:** criar regra "se lead de pré-venda não responde há 60 min, manda template X" → lead fica 60 min sem responder → template sai automaticamente.

### 🔲 Fase 3B — IA com RAG (modo híbrido)

**Estágio do lead é INFERIDO pela própria IA a cada interação.** Não vem de campo estático no banco. A IA lê as últimas N mensagens do chat + playbook e classifica o estágio atual (`pre-venda` | `comercial` | `sucesso` | `expansao` | `pos-venda`). A inferência é recalculada a cada novo inbound e persistida em `whatsapp_messages.inferred_stage` (audit trail) + `chats.current_stage` (último valor).

**Modo por estágio inferido:**
- **Pré-venda** → auto-send: IA responde sozinha, respeitando horário comercial e limite de 3 respostas automáticas consecutivas.
- **Comercial / Sucesso / Expansão / Pós-venda** → draft: IA gera sugestão, grava em `whatsapp_drafts`, aparece na sidebar com botão "Enviar" (1 clique confirma).

A classificação e a geração da resposta podem ser uma chamada única ao LLM (saída estruturada: `{stage, confidence, reply}`) — economiza token e evita inconsistência.

**RAG:**
- `ai_knowledge` com `content_md` + `embedding` (pgvector, 1536 dim) + `source_type` (playbook|historico|objecao|tom_de_voz).
- Ingesta inicial: (1) playbook comercial fornecido pelo Renan, (2) todas as mensagens históricas `direction=out` do próprio Renan para extrair tom.
- Query: últimas 10 mensagens do chat + top-5 knowledge relevante → prompt montado → LLM.

**LLM:** configurável (OpenAI/Anthropic/Gemini), default Claude Sonnet 4.6. Chave vive em variável do Edge Function, nunca no cliente.

**Guardrails auto-send (pré-venda):**
1. Máx 3 respostas automáticas consecutivas sem humano responder
2. Só dentro de horário comercial (configurável)
3. Nunca envia se a última mensagem contém palavras-gatilho ("advogado", "cancelar", "reembolso", etc) → fallback pra draft
4. Limite global por dia (safety cap)

**Critério de pronto:** lead de pré-venda manda "oi, tenho interesse" → IA responde em <30s com tom consistente com o playbook; lead de comercial manda a mesma coisa → aparece draft na sidebar para Renan aprovar.

### 🔲 Fase 3C — Analytics operacional
Sidebar direita tem aba "Métricas" mostrando:
- Tempo médio de primeira resposta (por Renan vs IA)
- Taxa de resposta de follow-ups (quantos lead respondem após envio automático)
- Número de drafts aprovados sem edição vs editados vs rejeitados (qualidade da IA)
- Mensagens enviadas hoje / semana / mês
- Deals movidos de estágio após interação via extensão

**Storage:** view materializada `whatsapp_analytics` atualizada a cada hora.

**Critério de pronto:** aba "Métricas" abre e mostra os 5 KPIs com dados reais, atualizados na última hora.

---

## 4. Schema Supabase (completo)

### Tabelas já existentes (Fase 1+2)
```sql
-- chats: registro de cada conversa monitorada
chats (
  id uuid pk,
  chat_id text unique,        -- id estável do WhatsApp (jid)
  chat_name text,
  phone text,
  is_group bool,
  deal_id uuid references deals(id),   -- vinculação com CRM
  current_stage text,         -- último estágio inferido pela IA (pre-venda|comercial|sucesso|expansao|pos-venda)
  stage_confidence numeric,   -- 0..1, confiança da última inferência
  stage_updated_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz default now()
)

-- whatsapp_messages: mensagens espelhadas, 1:1 com DOM do WhatsApp
whatsapp_messages (
  id uuid pk,
  chat_id text references chats(chat_id),
  deal_id uuid,                -- denormalizado para query direta
  raw_id text unique,          -- data-id do WhatsApp (dedup)
  direction text check (direction in ('in','out')),
  type text,                   -- text|audio|image|video|document|sticker|system
  author text,
  phone text,
  content_md text,
  media_url text,
  media_mime text,
  quoted_raw_id text,
  timestamp_wa timestamptz,    -- timestamp real do WhatsApp (não captured_at)
  captured_at timestamptz default now(),
  inferred_stage text,         -- estágio inferido pela IA nesta interação (audit trail)
  inferred_stage_confidence numeric
)
create index on whatsapp_messages (chat_id, timestamp_wa desc);
create index on whatsapp_messages (deal_id, timestamp_wa desc) where deal_id is not null;

-- whatsapp_outbox: fila CRM → WhatsApp
whatsapp_outbox (
  id uuid pk,
  chat_id text,
  content_md text,
  status text check (status in ('pending','sending','sent','failed')),
  error text,
  attempts int default 0,
  scheduled_for timestamptz,   -- nullable = enviar asap
  created_at timestamptz,
  sent_at timestamptz
)
create index on whatsapp_outbox (status, scheduled_for);
```

### Novas tabelas (Fase 3)

```sql
-- whatsapp_rules: regras de follow-up por tempo
create table whatsapp_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  enabled bool default true,
  trigger_type text check (trigger_type in (
    'lead_no_response',       -- lead parou de responder
    'agent_no_response',      -- você parou de responder
    'chat_created'            -- chat novo
  )),
  trigger_delay_minutes int not null,
  -- filtros
  inferred_stages text[],     -- null = todos; ou ['pre-venda','comercial'] — comparado com chats.current_stage inferido pela IA
  chat_is_group bool,
  only_business_hours bool default true,
  business_hours_start time default '09:00',
  business_hours_end time default '19:00',
  business_days int[] default '{1,2,3,4,5}',  -- 1=seg
  -- ação
  template_md text not null,
  max_runs_per_chat int default 1,  -- evita spam (1 = só uma vez por chat)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- whatsapp_rule_runs: auditoria (quem disparou, quando, pra qual chat)
create table whatsapp_rule_runs (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid references whatsapp_rules(id) on delete cascade,
  chat_id text references chats(chat_id),
  outbox_id uuid references whatsapp_outbox(id),
  status text check (status in ('queued','sent','skipped','failed')),
  skip_reason text,
  ran_at timestamptz default now()
);
create index on whatsapp_rule_runs (rule_id, chat_id);
create unique index on whatsapp_rule_runs (rule_id, chat_id) where status in ('queued','sent');
-- ↑ garante max_runs_per_chat=1 a nível de banco

-- whatsapp_drafts: sugestões da IA aguardando aprovação humana
create table whatsapp_drafts (
  id uuid primary key default gen_random_uuid(),
  chat_id text references chats(chat_id),
  content_md text not null,
  model text,                 -- 'claude-sonnet-4-6' | 'gpt-4o' | etc
  prompt_tokens int,
  completion_tokens int,
  context_message_ids uuid[],
  rag_knowledge_ids uuid[],
  status text check (status in ('pending','approved','rejected','edited','expired')),
  approved_outbox_id uuid references whatsapp_outbox(id),
  created_at timestamptz default now(),
  resolved_at timestamptz
);
create index on whatsapp_drafts (chat_id, status, created_at desc);

-- ai_knowledge: base RAG
create extension if not exists vector;
create table ai_knowledge (
  id uuid primary key default gen_random_uuid(),
  source_type text check (source_type in ('playbook','historico','objecao','tom_de_voz','outro')),
  title text,
  content_md text not null,
  embedding vector(1536),
  metadata jsonb default '{}',
  created_at timestamptz default now()
);
create index on ai_knowledge using ivfflat (embedding vector_cosine_ops) with (lists=100);

-- ai_config: configuração global (provider, modelo, prompt sistema, horário, limites)
create table ai_config (
  id int primary key default 1 check (id = 1),  -- linha única
  provider text default 'anthropic',
  model text default 'claude-sonnet-4-6',
  system_prompt text,
  auto_send_stages text[] default '{pre-venda}',
  draft_stages text[] default '{comercial,expansao}',
  max_auto_replies_per_chat int default 3,
  trigger_words_fallback text[] default '{advogado,processo,cancelar,reembolso,procon}',
  daily_auto_send_cap int default 200,
  business_hours_start time default '09:00',
  business_hours_end time default '19:00',
  updated_at timestamptz default now()
);
```

### RLS
Mantém permissive para MVP (usuário único). Quando time entrar, migrar para policies por `user_id`.

---

## 5. Ordem de execução

| # | Tarefa | Quem | Depende de |
|---|---|---|---|
| 0 | Fase 1+2 validadas end-to-end (1 mensagem in + 1 out) | Renan | nada |
| 1 | Ler/revisar `skills/design/SKILL.md` | Claude | 0 |
| 2 | Criar sidebar injetada no WhatsApp Web (estrutura vazia) | Claude | 1 |
| 3 | Aba "Regras" na sidebar + CRUD `whatsapp_rules` | Claude | 2 |
| 4 | Edge Function `rules-runner` (cron 1min) | Claude | 3 |
| 5 | Teste E2E: criar regra → lead inativo → template sai | Renan | 4 |
| 6 | Migration `ai_knowledge` + `ai_config` + `whatsapp_drafts` | Claude | 5 |
| 7 | Tela de ingesta de playbook na sidebar (upload texto + chunk + embed) | Claude | 6 |
| 8 | Edge Function `ai-responder` (detecta gatilho + RAG + LLM) | Claude | 7 |
| 9 | Aba "IA" na sidebar: lista drafts + botão aprovar/rejeitar/editar | Claude | 8 |
| 10 | Teste E2E: lead pré-venda → auto-send; lead comercial → draft | Renan | 9 |
| 11 | View `whatsapp_analytics` + aba "Métricas" na sidebar | Claude | 10 |
| 12 | Polimento final + checklist de design | Claude | 11 |

---

## 6. Tabela anti-bugs

Cada bug que pode acontecer já foi pensado antes de escrever código. Quando um novo aparecer, adiciona aqui.

| # | Bug | Sintoma | Mitigação |
|---|---|---|---|
| B1 | Dedup falha, mensagem duplicada | Mesma msg aparece 2x no CRM | `raw_id UNIQUE` + upsert idempotente |
| B2 | Timestamp errado ("Kkkkk16:02") | Hora vira parte do texto | Ler `data-pre-plain-text`, nunca `innerText` |
| B3 | Envio duplicado (race) | Outbox processada 2x | Transição atômica `pending→sending` via `UPDATE WHERE status='pending'` |
| B4 | Chat errado no envio | Mensagem vai pro chat errado | Confirmar `data-chatid` do painel ativo antes de digitar |
| B5 | DOM do WhatsApp muda (update) | Seletores quebram | Seletores encapsulados em `dom-selectors.ts`; retry + log do HTML completo em caso de falha |
| B6 | Extensão pausada, mensagens perdidas | Lead respondeu mas não entrou na base | Reconciliação ao reabrir: captura todas msgs visíveis e upsert |
| B7 | Follow-up dispara múltiplas vezes | Spam no lead | `unique index` em `rule_runs(rule_id, chat_id)` para regras com max_runs=1 |
| B8 | IA auto-send em contexto sensível | IA responde sobre processo judicial | `trigger_words_fallback` força draft |
| B9 | Loop IA ↔ IA (lead também tem bot) | Conversa infinita | `max_auto_replies_per_chat` (default 3 sem humano no meio) |
| B10 | RAG retorna conteúdo obsoleto | IA cita produto antigo | `ai_knowledge.created_at` como tiebreaker; re-ingesta periódica |
| B11 | Sidebar injetada "some" ao trocar de chat | WhatsApp re-renderiza #main | Observer em `#main` com reinject idempotente |
| B12 | Chave LLM vazada | `OPENAI_API_KEY` no bundle | Chave SÓ em Edge Function; extensão chama RPC, nunca LLM direto |
| B13 | Popup do Chrome com dados stale | Stats não atualizam | `setInterval(load, 5000)` + visibility listener |
| B14 | Outbox scheduled_for no passado sem executar | Mensagem agendada nunca sai | Runner filtra `scheduled_for <= now() OR scheduled_for is null` |
| B15 | Horário comercial vs fuso | Envia 3h da manhã | `business_hours_*` em UTC, conversão por chat |

---

## 7. Critérios de "pronto" por fase (global)

- Código passa no TypeScript em modo strict (`bun run typecheck`)
- Build limpa gera `dist/` sem warnings
- Chrome carrega a extensão sem erro
- Teste manual do fluxo principal: passa com mensagem real em chat real
- Sidebar renderiza sem quebrar o layout nativo do WhatsApp Web
- Nenhum `console.error` no DevTools durante o fluxo principal
- Design bate com o checklist em `skills/design/SKILL.md`

---

## 8. Decisões arquiteturais registradas

- **Extensão orquestra, Edge Function decide.** A extensão nunca chama LLM direto nem aplica regra sozinha — ela lê `whatsapp_drafts` e `whatsapp_outbox`. Quem decide é o backend. Motivo: evita divergência quando o time crescer e dá 1 ponto de controle.
- **Estágio do lead é INFERIDO pela IA**, não configurado manual nem campo estático. A cada inbound a IA classifica o estágio atual com base nas últimas mensagens + playbook e persiste em `chats.current_stage` + `whatsapp_messages.inferred_stage` (audit). Supabase é infra de persistência, não fonte da decisão.
- **Sidebar injetada, não overlay sobreposto.** Ocupa 320px à direita do chat, empurrando o DOM nativo. Motivo: coexistência clara, usuário não se perde.
- **Cadência multi-step fica no CRM.** Extensão só faz regra de tempo simples. Motivo: manter escopo enxuto, reusar o que o CRM já precisa ter.
- **Classificação + geração numa chamada só.** O Edge Function `ai-responder` pede saída estruturada `{stage, confidence, reply_md}` em uma única ida ao LLM. Economiza token e garante coerência entre o estágio decidido e a resposta gerada.
