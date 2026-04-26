# Contratos Canonicos Do CRM

Este arquivo e a fonte de verdade para UI, services, Edge Functions e workers.

## Principios

- `activities` e a fonte unica da timeline. `interactions` e legado read-only para backfill/auditoria.
- `deals.stage_id` e o estado canonico do pipeline. Nome, cor e ordem do stage vem de `stages`.
- `activities.contact_id` e singular. Envolvimento de varios contatos deve ser representado no payload ou por multiplas activities.
- Workers nao devem depender de texto visivel da UI para decidir fluxo.
- Todo contrato novo deve ser aditivo e idempotente em migration.

## Activity

Tabela: `public.activities`

Campos obrigatorios de contrato:

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | Gerado pelo banco |
| `kind` | text | `note`, `email`, `call`, `meeting`, `whatsapp`, `task`, `sequence_step`, `stage_change`, `property_change`, `enrollment` |
| `subject` | text nullable | Titulo curto para timeline |
| `body` | text nullable | Conteudo principal |
| `direction` | text nullable | `in`, `out` ou null |
| `occurred_at` | timestamptz | Quando aconteceu |
| `created_by` | uuid nullable | Usuario/owner que criou |
| `contact_id` | uuid nullable | Contato principal |
| `company_id` | uuid nullable | Empresa relacionada |
| `deal_id` | uuid nullable | Negocio relacionado |
| `payload` | jsonb | Dados especificos do canal/feature |

Payload minimo para mensagens:

```json
{
  "source": "whatsapp_extension",
  "provider": "whatsapp_web",
  "external_message_id": "provider-id",
  "thread_key": "chat_key",
  "template": "Oi {{contact.first_name}}",
  "body_rendered": "Oi Renan",
  "variables_used": ["contact.first_name"],
  "variables_missing": []
}
```

## Deal

Tabela: `public.deals`

Campos canonicos:

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | Gerado pelo banco |
| `title` | text | Nome do negocio |
| `value` | numeric nullable | Valor esperado |
| `stage_id` | uuid nullable | FK para `public.stages.id` |
| `funnel_id` | uuid nullable | FK para `public.funnels.id` |
| `contact_id` | uuid nullable | Contato principal |
| `company_id` | uuid nullable | Empresa |
| `owner_id` | uuid | Responsavel |
| `expected_close` | date nullable | Data prevista |

Proibido em codigo novo:

- Ler `deals.stage`.
- Escrever `{ stage: "Proposta" }` em `deals`.
- Usar texto do stage como identificador persistido.

Permitido:

- Exibir `stages.name`.
- Gravar `stage_change` em `activities.payload` com `from_stage_id`, `to_stage_id`, `from_stage_name`, `to_stage_name`.

## Sequence Flow

### Sequence

Tabela: `public.sequences`

Campos minimos:

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | Gerado pelo banco |
| `name` | text | Nome visivel |
| `channel` | text | `whatsapp`, `email`, `both` |
| `active` | boolean | Se pode executar |
| `stop_on_reply` | boolean | Para ao receber inbound |
| `max_enrollments_per_day` | int | Quota operacional |

### Step

Tabela atual: `public.sequence_steps_v2`

Contrato logico:

```ts
type StepType =
  | "start"
  | "email_manual"
  | "email_auto"
  | "call_task"
  | "linkedin_task"
  | "whatsapp_task"
  | "wait"
  | "condition"
  | "end";
```

`config` por tipo:

```json
{
  "body_template": "Oi {{contact.first_name}}, vi a {{company.name}}.",
  "subject_template": "Ideia para {{company.name}}",
  "days": 2,
  "business_hours_only": true,
  "condition": "replied",
  "fallback": "block"
}
```

### Edge

Contrato esperado para Onda 2:

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | Gerado pelo banco |
| `sequence_id` | uuid | FK sequence |
| `source_step_id` | uuid | FK step |
| `target_step_id` | uuid | FK step |
| `source_handle` | text nullable | `true`, `false`, `default` |
| `condition` | text nullable | `replied`, `opened`, `clicked`, `meeting_booked`, `field_present`, `lifecycle_changed` |
| `position` | int | Ordem visual/execucao fallback |

## Variaveis De Template

Contrato canonico:

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

Aliases aceitos na UI, compilados antes de salvar/executar:

```txt
{{nome}} -> {{contact.first_name}}
{{empresa}} -> {{company.name}}
{{empreendimento}} -> {{company.custom.nome_empreendimento}}
```

Fallbacks validos:

- `block`: bloqueia save/envio se faltar variavel.
- `skip_contact`: pula aquele contato e registra erro estruturado.
- `default`: usa valor default configurado no step.

Worker e UI devem registrar:

- `template`
- `body_rendered`
- `variables_used`
- `variables_missing`
- `fallback_strategy`

