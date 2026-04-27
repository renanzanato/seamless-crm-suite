# Hub Canonico De Engenharia: Pipa Driven CRM

Este documento e a fonte de verdade para as frentes de engenharia do CRM Pipa Driven. Ele combina o baseline "basico bem feito" com benchmarks de Monaco ABM, Coffee.ai, Apollo, GoHighLevel, HubSpot Buying Groups, Outreach e Salesloft.

Principio: construir profundidade no que ja existe. Sem landing page, dialer, academy, marketplace ou base propria gigante nesta fase. Cada PR fecha uma track explicita, passa pelo checklist anti-bug e deixa o dominio coerente ponta a ponta.

## Como Usar

1. Siga a ordem em **Execucao em fases**. Nao pule fase.
2. Cada PR deve nomear a track e o item fechado.
3. Antes de mergear, rode o **Checklist anti-defeito**.
4. Toda decisao critica de schema deve atualizar este documento ou `docs/contracts.md`.
5. Monaco e tratado aqui como **ABM** (Account-Based Marketing/Selling), nao ABS.

## Benchmarks Traduzidos Em Codigo

### Monaco ABM

| Funcionalidade | Codigo esperado | Track |
|---|---|---|
| ICP -> TAM building | `build_tam(icp_definition)` materializa contas alvo com `tam_score`, `account_tier`, `target_persona_count` | G |
| Signal prioritization | View/materializacao `account_signals` com visitas, replies, WhatsApp, comite e momentum | I |
| AI-driven outbound | Sequencia escolhida por `account_tier`, `buying_role` e stage | F/C |
| Interaction capture | Mensagem WhatsApp vira activity estruturada e alimenta extracoes | A/J |
| CRO Copilot | `generate_call_feedback` cria `coaching_notes` pos reuniao | C |
| Nothing slips | Job `detect_slipping_deals` gera tarefa obrigatoria para deal parado | I |

### Coffee.ai

| Funcionalidade | Codigo esperado | Track |
|---|---|---|
| Autonomous data entry | `extract-conversation` grava fatos em `conversation_extractions` | J |
| Pipeline compare | `deal_state_snapshots` diario + pagina `/pipeline/compare` | I |
| Meeting prep | OpenClaw gera `meeting_briefs` antes da reuniao | C |
| Warehouse-backed history | Historico append-only de snapshots e decisoes | I/C/F |
| Shadow CRM | Acao fora do CRM capturada como evento estruturado | A |

### Apollo, Outreach, Salesloft

| Funcionalidade | Codigo esperado | Track |
|---|---|---|
| Stage triggers | Enrollment por mudanca de stage | F |
| Reply sentiment | Classificacao de inbound e auto-pause | H/F |
| Out-of-office | Pausa ate `parsed_return_date` | H/F |
| Deliverability warning | Banners e throttle por qualidade | K |
| Message-ID threading | Reply detection real para email | K |

### GoHighLevel E HubSpot Buying Groups

| Funcionalidade | Codigo esperado | Track |
|---|---|---|
| Triggers/actions/conditions | Steps `wait`, `condition`, `action` | F |
| Workflow audit log | `cadence_step_runs` com guards e payload | F |
| Buying committee | `deal_contacts` com `buying_role` | I |
| Single-thread risk | Trigger atualiza `single_threaded_risk` | I |
| Persona gap | `committee_gaps` para tier 1/2 | G/I |

## Execucao Em Fases

| Fase | Tracks | Bloqueio | Branch base |
|---|---|---|---|
| 1. Doc canonico | E | nenhum | `main` |
| 2. Nucleo paralelo | A, D, H, I, J, G | E mergeado | `main` |
| 3. Cadencia | F | H e I mergeados | `main` |
| 4. Ponte automacao | B | A E1.1/E1.7/E1.11/E1.12 mergeados | `main` |
| 5. Runtime autonomo | C | B `getStatus` + `sendMessage` mergeados | `main` |
| 6. Qualidade envio | K | A e H mergeados | `main` |

## Tracks

| # | Track | Branch | Entrega principal | Status |
|---|---|---|---|---|
| 1 | E - Doc canonico | `docs/extension-canon` | Contratos, schemas e plano das 11 tracks | [ ] |
| 2 | A - Hardening extensao | `ext/hardening` | MV3 robusta, fila, telemetria, watchdog, taxonomy | [ ] |
| 3 | D - Extension ops | `core/extension-ops` | Heartbeat, telemetry, config e painel | [ ] |
| 4 | H - Reply Intelligence | `core/reply-intel` | Classificacao inbound + suppression list | [ ] |
| 5 | I - Pipeline Engine | `core/pipeline-engine` | Comitê, momentum, quotas, snapshots | [ ] |
| 6 | J - Conversation Extraction | `core/conversation-extraction` | Extracoes estruturadas e fila humana | [ ] |
| 7 | G - Enrichment + ABM | `core/enrichment` | Providers, dedupe, tiers e gaps | [ ] |
| 8 | F - Cadencia | `core/cadence` | Enrollment, triggers, branch, audit | [ ] |
| 9 | B - OpenClaw API local | `ext/openclaw-api` | Native Messaging Host + guard chain | [ ] |
| 10 | C - OpenClaw Runtime | `openclaw/runtime` | Agente autonomo com approvals e coaching | [ ] |
| 11 | K - Deliverability | `core/deliverability` | WA quality, warmup e auto-throttle | [ ] |

## Track E - Documento Canonico

Escopo:

- Atualizar `extension/PLANO_EXTENSAO.md` com 3.11 a 3.20.
- Manter este arquivo como hub mestre.
- Linkar este hub no `README.md`.

Aceite:

- Operador novo entende escopo e dependencias em menos de 30 minutos.
- `raw_id`, payload polimorfico, enums, guards e error codes estao documentados.
- As tracks podem ser executadas por LLMs diferentes sem depender de conversa previa.

## Track A - Hardening Da Extensao MV3

Objetivo: deixar a extensao production-grade sem trocar para BSP oficial agora.

Itens obrigatorios:

- Protocolo local: `getStatus`, `sendMessage`, `listChats`, `sendReaction`.
- Selectors versionados por remote config com checksum e fallback.
- Heartbeat a cada 30s com `ext_version`, `wpp_version`, `account_hash`, `queue_depth`, `last_error`.
- Fixtures de mensagem para text, ptt, audio, image, sticker, video, document, reaction, delete, edit, quoted, forwarded, vcard, location.
- Queue IndexedDB com retry exponencial e dead-letter.
- Modo passivo e kill switch global.
- Telemetria com PII scrubber.
- Taxonomia de mensagem completa e media decrypt quando possivel.
- Executable blocklist.
- Allowlist + account binding.
- WPP watchdog.
- Backpressure + badge UI.

Aceite:

- 14 fixtures passam em CI.
- Modo passivo desliga envios em ate 5s.
- WPP morto vira `degraded` em ate 60s.
- `queue_depth > 200` bloqueia novos envios externos.
- PII scrubber bloqueia telefone, email, CPF e CNPJ em telemetria.

## Track D - Extension Ops

Objetivo: criar CRM-side para operar a extensao.

Tabelas:

- `extension_status`: `account_id`, `user_id`, `account_hash`, `ext_version`, `wpp_version`, `queue_depth`, `last_error`, `state`, `last_heartbeat`.
- `extension_telemetry`: eventos estruturados scrubados.
- `extension_config`: selectors, checksum, rate limits, kill switch, passive mode, business hours.

Edge Functions:

- `extension-heartbeat`
- `extension-telemetry`
- `extension-config`

UI:

- `src/pages/ExtensaoSaude.tsx`: status por usuario/conta, fila, ultimo erro, kill switch.

Aceite:

- 2 minutos sem heartbeat vira `offline`.
- `queue_depth > 200` vira `degraded`.
- Kill switch remoto chega na extensao em ate 30s.
- Telemetria gravada nao contem PII.

## Track H - Reply Intelligence E Suppression

Objetivo: classificar inbound e impedir cadencia indevida.

Enums:

- `positive_intent`
- `meeting_requested`
- `not_now`
- `not_interested`
- `out_of_office`
- `wrong_person`
- `referral`
- `unsubscribe_request`
- `unclear`

Schema:

- `activities.reply_classification`
- `activities.classification_confidence`
- `activities.classified_at`
- `activities.classified_by`
- `activities.sentiment_score`
- `activities.parsed_return_date`
- `activities.referral_contact_hint`
- `suppression_list`

Aceite:

- `unsubscribe_request`, `not_interested` e `wrong_person` criam suppression.
- Override humano nao e sobrescrito.
- Out-of-office extrai data quando houver.
- F respeita suppression antes de qualquer envio.

## Track I - Pipeline Engine

Objetivo: pipeline auto-regulado, comite de compra e pacing.

Entidades:

- `deal_contacts`
- `quotas`
- `quota_pacing`
- `deal_state_snapshots`
- `deal_state_history` quando houver mutacoes relevantes.

Regras:

- `single_threaded_risk` e atualizado por trigger, nao por generated column com subquery.
- `momentum_score` combina atividades, replies positivos e aging.
- `detect_slipping_deals` cria uma task system-driven idempotente.
- `PipelineCompare` mostra diff entre snapshots.

Aceite:

- Deal com um unico contato aparece como single-threaded.
- Snapshot diario roda sem mutacao destrutiva.
- Task slipping nao duplica.
- HojePage passa a destacar tarefas system-driven.

## Track J - Conversation Extraction

Objetivo: transformar conversas em fatos estruturados.

Tipos:

- `next_step`
- `decision_maker_mentioned`
- `objection`
- `price_quoted`
- `date_agreed`
- `competitor_mentioned`
- `pain_point`
- `budget_signal`
- `timeline_signal`

Regras:

- `next_step` e `date_agreed` de baixo risco podem ser auto-aplicados.
- Medio/alto risco cai em `/extracoes`.
- Rejeicao humana impede reprocessamento automatico do mesmo item.
- Extracao nunca sobrescreve dado manual mais novo.

Aceite:

- `conversation_extractions` tem `risk_level`, `confidence`, `status`, `reviewed_by`.
- Deal mostra timeline de extracoes.
- Auto-apply e auditavel.

## Track G - Enrichment + ABM Tiering

Objetivo: enriquecer dados ate o limite do que ja temos/contratamos, sem construir base propria gigante.

Providers:

- Apollo
- ReceitaWS
- EmailValidator
- Clearbit ou equivalente futuro

Schemas:

- `companies.account_tier`
- `companies.tam_score`
- `companies.target_persona_count`
- `companies.icp_match_reasons`
- `contacts.normalized_email`
- `contacts.normalized_phone`
- `contact_merge_candidates`
- `committee_gaps`

Tiers:

- `tier_1`: 10-50 contas, `target_persona_count=4`, abordagem bespoke.
- `tier_2`: 50-200 contas, `target_persona_count=2`, cluster.
- `tier_3`: 200+ contas, `target_persona_count=1`, programmatic.

Aceite:

- Provider down faz fallback.
- Email duplicado nao cria novo contato.
- Dedupe fuzzy detecta variantes comuns.
- AccountStrategy mostra gaps de comite.

## Track F - Cadencia

Objetivo: motor de cadencia com triggers, comite, reply intelligence e audit.

Entidades:

- `sequences`
- `cadence_steps`
- `enrollments`
- `cadence_step_runs`
- `proposed_enrollments`

Step types:

- `wait`
- `condition`
- `action`

Triggers:

- `manual`
- `stage_change`
- `signal_threshold`
- `recurring`
- `date_anchored`

Regras:

- Worker usa `SELECT ... FOR UPDATE SKIP LOCKED`.
- Enrollment checa suppression e duplicidade ativa.
- Positive reply encerra/pause conforme H.
- Out-of-office pausa ate 09:00 local de `parsed_return_date`.
- Branch false cai em `else_branch_step_order`.

Aceite:

- Stage trigger nao duplica enrollment.
- Comite com roles distintos gera enrollments distintos quando configurado.
- `cadence_step_runs` registra guards e payload.
- Proposed enrollments ajudam fechar pace diario.

## Track B - OpenClaw API Local

Objetivo: expor a extensao para OpenClaw via Native Messaging Host.

Componentes:

- `com.pipa.bridge`
- `contact_automation_settings`
- Command dispatcher
- Token rotativo
- Template renderer espelhado
- `ContactAutomationToggle`
- `OpenClawHandshake`

Comandos:

- `getStatus()`
- `sendMessage({ contact_id, text|media, idempotency_key })`
- `sendReaction({ raw_id, emoji })`
- `listChats({ since })`

Guard chain:

1. `validateToken`
2. `checkKillSwitch`
3. `checkAccountBinding`
4. `checkContactAuthorized`
5. `checkSuppression`
6. `checkBusinessWindow`
7. `checkRateLimit`
8. `checkChatExists`
9. `lockContact`

Aceite:

- Token errado retorna `INVALID_TOKEN`.
- Contato sem autorizacao retorna `NOT_AUTHORIZED`.
- Duas tentativas paralelas para o mesmo contato nao enviam duas mensagens.
- Mismatch de conta retorna `NO_ACCOUNT`.

## Track C - OpenClaw Runtime

Objetivo: runtime autonomo que consome filas de envio, gera copy, valida, pede approval quando necessario e envia pela extensao.

Entidades:

- `openclaw_runs`
- `coaching_notes`
- `meeting_briefs`

Intents:

- `outbound_first_touch`
- `followup`
- `nurture`
- `meeting_prep`
- `meeting_recap`
- `reanimation`

Validator estilo Lavender:

- WhatsApp body ate 350 caracteres.
- Maximo 1 pergunta.
- 1 CTA claro.
- Sem spam words.
- Sem URL encurtada.
- Sem promessa de preco/garantia sem dado no deal.
- Personalizacao real obrigatoria.
- Score medio abaixo de 0.7 vai para `/openclaw/approvals`.

Aceite:

- High stakes sempre pede aprovacao.
- Meeting brief aparece antes da reuniao.
- Coaching notes geram 3 sugestoes por reuniao.
- Rate limit global nunca e excedido.

## Track K - Deliverability E Quality

Objetivo: controlar risco de banimento/queda de qualidade no WhatsApp.

Entidades:

- `wa_quality_samples`
- `deliverability_actions`
- `deliverability_dashboard`

Regras:

- Quality red ou block rate > 5% pausa outbound.
- Quality yellow ou block rate 2-5% reduz limite.
- Conta nova respeita warmup 20 -> 40 -> 80 -> 200 -> 400 -> 800.
- 7 dias verdes permitem throttle up.

Aceite:

- Pause outbound aplica em ate 5min.
- Dashboard atualiza via Realtime.
- Banner global mostra acao ativa.

## Checklist Anti-Defeito

### Idempotencia

- [ ] Mensagens usam `UNIQUE (account_id, raw_id)`.
- [ ] Edge Functions de criacao aceitam `Idempotency-Key`.
- [ ] Reenvio do mesmo `raw_id` retorna sucesso idempotente.
- [ ] Enrollment ativo duplicado vira no-op com log.
- [ ] Edit/delete/reaction usam `raw_id` derivado.

### Race Conditions

- [ ] Workers usam `FOR UPDATE SKIP LOCKED`.
- [ ] OpenClaw usa lock por `contact_id`.
- [ ] Guard de inbound concorrente usa lock/advisory lock.
- [ ] Atualizacao critica usa optimistic concurrency quando aplicavel.

### Timezone E Datas

- [ ] Timestamp e sempre `TIMESTAMPTZ`.
- [ ] Business window converte `now()` para timezone certo.
- [ ] UI nao formata `toISOString()` direto para data local.
- [ ] Agendamento 09:00 local permanece 09:00 local.

### Soft Delete

- [ ] Tabelas com `deleted_at` ocultam deletados.
- [ ] JOINs usam views ativas ou filtro explicito.
- [ ] Historico nunca e apagado por soft delete.

### Multi-Tenant

- [ ] Toda tabela nova tem `account_id` ou justificativa documentada.
- [ ] RLS cruza `account_id`, nao apenas `auth.uid()`.
- [ ] Edge Function com service role valida JWT e account antes de gravar.

### Paginacao

- [ ] Lista grande usa keyset pagination.
- [ ] Ordenacao tem tiebreaker por `id`.
- [ ] Limite maximo e hard-coded.

### Validacao

- [ ] Edge Function valida payload com Zod ou equivalente.
- [ ] Migration e idempotente e, quando possivel, tem down.
- [ ] JSONB critico tem schema documentado.
- [ ] FK tem `ON DELETE` explicito.

### Observabilidade

- [ ] Logs incluem `request_id`, `account_id`, `actor_id`, `latency_ms`, `error_code`.
- [ ] Guard bloqueado vira audit/evento.
- [ ] Erros 5xx geram alerta.

### WhatsApp E Native Messaging

- [ ] Token 256 bits e comparacao em tempo constante.
- [ ] `openclaw_authorized` default false.
- [ ] Account binding obrigatorio.
- [ ] Rate limit por `account_hash`.
- [ ] Sem `eval` ou `innerHTML` com conteudo de mensagem.

### UX

- [ ] Botao fica disabled durante request.
- [ ] Toast mostra `error_code` e acao sugerida.
- [ ] Realtime tem cleanup em `useEffect`.
- [ ] Optimistic update tem rollback.

## Schema Canonico De Mensagem

`activity.payload` e polimorfico. Discriminator: `payload.kind`.

```json
{"kind":"text","text":"Bom dia, tudo bem?"}
```

```json
{"kind":"ptt","audio_base64":"...","duration_sec":12,"transcript":"...","transcribed_at":"2026-04-26T11:00:00-03:00"}
```

```json
{"kind":"document","file_base64":"...","filename":"proposta.pdf","mime":"application/pdf","size_bytes":102400}
```

Kinds oficiais:

- `text`
- `ptt`
- `audio`
- `image`
- `video`
- `sticker`
- `document`
- `vcard`
- `location`
- `reaction`
- `quoted`
- `forwarded`
- `edit`
- `delete`
- `call_log`
- `system`

## Convencao De `raw_id`

- text/media: `<chat_id>:<wpp_msg_id>`
- edit: `<chat_id>:<wpp_msg_id>:edit:<edit_seq>`
- delete: `<chat_id>:<wpp_msg_id>:delete`
- reaction: `<chat_id>:<wpp_msg_id>:reaction:<reactor_phone>`

`UNIQUE (account_id, raw_id)` impede duplicidade.

## Enums Consolidados

```text
reply_classification:
  positive_intent | meeting_requested | not_now | not_interested |
  out_of_office | wrong_person | referral | unsubscribe_request | unclear

buying_role:
  decision_maker | economic_buyer | champion | influencer | user |
  technical | legal | finance | blocker | unknown

extraction_type:
  next_step | decision_maker_mentioned | objection | price_quoted |
  date_agreed | competitor_mentioned | pain_point | budget_signal | timeline_signal

account_tier:
  tier_1 | tier_2 | tier_3

openclaw_intent:
  outbound_first_touch | followup | nurture | meeting_prep | meeting_recap | reanimation

enrolled_via:
  manual | committee | stage_trigger | signal | proposed

completion_reason:
  replied_positive | meeting_booked | reached_end | suppressed |
  manual_stop | out_of_office_pause | wrong_person | not_interested
```

## Error Codes Do OpenClaw

| Code | Significado | Acao do cliente |
|---|---|---|
| `INVALID_TOKEN` | Token expirado ou invalido | Refazer handshake |
| `BLOCKED` | Kill switch ativo | Aguardar admin |
| `NO_ACCOUNT` | Account binding mismatch | Re-login WhatsApp |
| `NOT_AUTHORIZED` | Contato sem autorizacao | Operador ativa toggle |
| `SUPPRESSED` | Contato em suppression list | Completar enrollment como suppressed |
| `OUTSIDE_WINDOW` | Fora do horario permitido | Reagendar |
| `RATE_LIMIT` | Limite atingido | Aguardar `Retry-After` |
| `INVALID_CHAT` | WPP nao encontrou chat | Marcar WA invalido |
| `RENDER_FAILED` | Variavel nao resolvida | Notificar operador |
| `WPP_NOT_READY` | WhatsApp nao carregou | Retry com backoff |
| `HIGH_STAKES_LOCK` | Aprovacao humana obrigatoria | Enviar para fila humana |

## Idempotency-Key Universal

Toda Edge Function que cria entidade deve aceitar:

```http
Idempotency-Key: <uuid-v4>
Authorization: Bearer <jwt>
```

Tabela padrao:

```sql
CREATE TABLE idempotency_keys (
  account_id uuid NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL,
  response_status int,
  response_body jsonb,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '24 hours',
  PRIMARY KEY (account_id, key)
);
```

Fluxo:

1. Calcular `request_hash = sha256(account_id + path + body)`.
2. Se chave existe e hash bate, retornar resposta armazenada.
3. Se chave existe e hash diverge, retornar `422 IDEMPOTENCY_KEY_REUSED`.
4. Se nao existe, processar e armazenar antes de responder.

## Metricas Norte

1. Taxa de reply positiva por sequencia e tier.
2. Custo por reuniao agendada.
3. Percentual de tarefas system-driven em `HojePage` (alvo 80%).
4. Percentual de updates automaticos de deal (alvo 60%).
5. Forecast accuracy mensal (alvo >80%).
6. Daily pace adherence.
7. Tempo entre reply inbound e acao (alvo <5min).
8. Single-threaded ratio em tier 1/2 (alvo <20%).
9. WA quality score verde 90% do tempo, nunca vermelho.

## Filas Humanas

| Rota | Conteudo | Track | SLA |
|---|---|---|---|
| `/respostas-revisar` | Replies ambiguas ou de alto impacto | H | 2h |
| `/extracoes` | Extracoes medium/high risk | J | 4h |
| `/enrollments/propostos` | Sugestoes para fechar pace | F | 4h |
| `/openclaw/approvals` | Drafts high stakes | C | 30min |

## Fora De Escopo Desta Fase

- Landing page.
- Academy.
- Dialer/VoIP.
- BSP oficial WhatsApp como Z-API, Twilio, Gupshup ou 360dialog.
- Base propria de centenas de milhoes de contatos.
- Marketplace de integracoes.
- Mobile app nativo.
- OpenClaw movendo deal de stage sem revisao.
