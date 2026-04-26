# Estrutura De Ondas: Basico Bem Feito

Principio: profundidade dentro do que ja existe, zero feature nova fora do escopo. Sem landing page, sem dialer, sem academy. Cada onda so fecha quando o dominio esta coerente ponta a ponta.

## Onda 0: Higiene De Schema E Contratos

- Consolidar `activities` como unica fonte de interacao. `interactions` fica legado read-only para backfill/auditoria.
- Padronizar `deals.stage_id` em todo o codigo. Codigo novo nao le nem escreve `deals.stage`.
- Padronizar `contact_id` singular em `activities`, tasks e sequence runs.
- Documentar contrato unico de step, edge e variavel em [contracts.md](./contracts.md).
- Migrations idempotentes auditadas.
- `whatsapp_wipe.sql` fica em `scripts/manual/`, fora do deploy normal.

Pronto quando: typecheck, lint, build e testes passam sem warning de schema drift conhecido.

## Onda 1: Estabilidade De Integracao

- Auditar rotas: `Index`, `Hoje`, `Sequencias`, `SequenceBuilderV2`, `CompanyDetail`, `DealDetail`, `ContactDetail`.
- Cleanup de subscriptions Supabase em todo unmount.
- Estados de loading, vazio e erro padronizados em componente unico.
- Fallback para tabelas opcionais retorna lista vazia, nunca tela quebrada.
- Reload em qualquer tela mantem estado coerente.

Pronto quando: dez reloads consecutivos em cada tela critica nao geram erro no console nem tela branca.

## Onda 2: Cadencia Completa

### 2.1 Builder Visual Real

- Persistencia de nodes e edges em tabelas dedicadas.
- Node inicial obrigatorio e node `Fim` obrigatorio.
- Branching: respondeu, abriu email, clicou, marcou reuniao, campo preenchido, lifecycle mudou.
- Validacao no save: sem start, node solto, condicao sem saida, loop, template invalido.
- Auto-layout opcional ao reabrir.

### 2.2 Variaveis E Templates

- `templateRenderer` unico, espelhado no worker.
- Aliases PT compilam para contrato canonico.
- Preview por contato real selecionado.
- Destaque visual de variavel invalida ou ausente.
- Fallback configuravel: bloquear envio, pular contato, ou usar default.
- Activity payload registra template, body renderizado, variaveis usadas e faltantes.

### 2.3 Enrollment

- Enrollar por contato, empresa com N contatos, lista salva e filtro dinamico.
- Modal unico `Adicionar a cadencia` com checagem de duplicidade.
- Regra anti-spam: mesmo contato nao entra em duas cadencias do mesmo canal.

### 2.4 Execucao

- Worker respeita edges, condicionais e wait.
- Stop on reply via `activities` inbound.
- Stop on meeting booked.
- Stop on deal stage change configuravel.
- Pause manual e resume sem perder posicao.
- Idempotencia: retry nao duplica envio nem tarefa.

### 2.5 Observabilidade Da Cadencia

- Tela de status do enrollment: step atual, proximo step, proxima execucao.
- Log estruturado por enrollment.
- Dashboard simples: ativos, em erro, finalizados, taxa de resposta.

Pronto quando: usuario cria fluxo com branch, enrolla empresa, ve tarefa em Hoje, responde inbound, cadencia para sozinha, timeline mostra tudo.

## Onda 3: Deliverability Minima Viavel

- Validacao de SPF, DKIM e DMARC do dominio conectado.
- Limite diario por mailbox configuravel e respeitado pelo worker.
- Janela de horario comercial por contato, com fallback no timezone do owner.
- Deteccao de bounce e marcacao automatica do contato.
- Suppression list global por workspace.
- Unsubscribe link automatico em emails, com pagina funcional.
- Reply detection por `Message-ID` e `In-Reply-To`.

Pronto quando: bounce nao vira novo envio, opt-out impede cadencia futura, replies sao detectadas no mesmo thread.

## Onda 4: Enriquecimento

- Lookup automatico ao criar contato.
- Validacao de email, MX, descartavel e role-based.
- Normalizacao de telefone para E.164.
- Merge de duplicados por email, telefone e LinkedIn.
- Lookup por dominio para empresa.
- `nome_empreendimento` em custom props para incorporadoras.
- Provider abstraction com cache e audit trail.
- Job semanal re-enriquece dados faltantes.

Pronto quando: criar contato com email dispara enriquecimento, dado faltante volta a ser tentado, fonte e trocavel sem reescrever consumidor.

## Onda 5: Inbox E Respostas

- Inbox unificado: WhatsApp, email, chamadas registradas, LinkedIn manual.
- Resposta inbound liga automaticamente em contato e cadencia ativa.
- Marcar resposta como tratada, com follow-up em um clique.
- Atalho para criar tarefa, mover deal ou registrar nota.
- Filtros por sem resposta, respostas novas e cadencia especifica.

Pronto quando: toda resposta inbound aparece no Inbox, vincula ao contato e oferece acao imediata.

## Onda 6: Painel Operacional

- Cada card clicavel leva a lista filtrada correspondente.
- Meta do mes configuravel por usuario e workspace.
- Calculo `precisa fazer Y por dia util restante` usando calendario Brasil.
- Estado vazio por bloco.

## Onda 7: Compliance LGPD Minima

- `consent_source` e `consent_date` por contato.
- Exclusao sob solicitacao.
- Retencao configuravel de transcricoes WhatsApp.
- Log de acesso a dados pessoais.
- Unsubscribe global respeitado por todos os canais.

## Onda 8: Observabilidade Do Worker

- Logs estruturados em todos os jobs do `sequence-worker-v2`.
- Dead-letter queue para enrollments quebrados.
- Dashboard interno de filas, retries, falhas e tempo medio por step.
- Alerta simples quando taxa de erro passar de 5% em uma hora.

## Onda 9: QA E Regressao

- Smoke tests manuais documentados por onda.
- Testes automatizados: template, fluxo, enrollment, stop on reply, suppression list, fallback de schema.
- Checklist fixo de pre-deploy.

## Ordem

1. Onda 0 sozinha.
2. Onda 1 sozinha.
3. Ondas 2 e 4 em paralelo.
4. Onda 3 logo apos Onda 2 entrar em producao.
5. Onda 5 apos Onda 2 estavel.
6. Onda 6 em paralelo com 5.
7. Onda 7 antes do primeiro cliente externo.
8. Onda 8 em paralelo com 6 e 7.
9. Onda 9 fecha cada release.

## Guardrails

- Nenhuma feature fora desta lista entra nesta fase.
- Cada PR fecha um item explicito de uma onda.
- Migrations sempre idempotentes e reversiveis quando possivel.
- Nenhum codigo novo le `deals.stage` ou `interactions`.
- IA fica fora ate Onda 9 fechar.

