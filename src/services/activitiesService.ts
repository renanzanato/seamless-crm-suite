import { supabase } from "@/lib/supabase";

// ── Types ────────────────────────────────────────────────

export type ActivityKind =
  | "note"
  | "email"
  | "call"
  | "meeting"
  | "whatsapp"
  | "task"
  | "sequence_step"
  | "stage_change"
  | "property_change"
  | "enrollment";

export type ActivityDirection = "in" | "out" | null;

export interface ActivityAuthor {
  id: string | null;
  name: string | null;
}

export interface Activity {
  id: string;
  kind: ActivityKind;
  subject: string | null;
  body: string | null;
  direction: ActivityDirection;
  occurredAt: string;
  contactId: string | null;
  companyId: string | null;
  dealId: string | null;
  payload: Record<string, unknown>;
  author: ActivityAuthor;
}

interface ActivityRow {
  id: string;
  kind: ActivityKind;
  subject: string | null;
  body: string | null;
  direction: ActivityDirection;
  occurred_at: string;
  contact_id: string | null;
  company_id: string | null;
  deal_id: string | null;
  payload: Record<string, unknown> | null;
  created_by: string | null;
  profiles?: { id: string | null; name: string | null } | { id: string | null; name: string | null }[] | null;
}

const ACTIVITY_SELECT = `
  id, kind, subject, body, direction, occurred_at,
  contact_id, company_id, deal_id, payload, created_by,
  profiles:created_by (id, name)
`;

// ── Helpers ──────────────────────────────────────────────

function normalizeRow(row: ActivityRow): Activity {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return {
    id: row.id,
    kind: row.kind,
    subject: row.subject,
    body: row.body,
    direction: row.direction,
    occurredAt: row.occurred_at,
    contactId: row.contact_id,
    companyId: row.company_id,
    dealId: row.deal_id,
    payload: row.payload ?? {},
    author: {
      id: profile?.id ?? row.created_by ?? null,
      name: profile?.name ?? null,
    },
  };
}

export interface ActivitiesQueryOptions {
  /** Máximo de linhas a trazer. Default 200. */
  limit?: number;
  /** Filtro por lista de kinds (client-side é cliente, mas também aplicável no server). */
  kinds?: ActivityKind[];
  /** Buscar apenas activities anteriores a essa data (cursor). */
  before?: string;
}

export interface CreateNoteActivityInput {
  contactId?: string | null;
  companyId?: string | null;
  dealId?: string | null;
  body: string;
  createdBy?: string | null;
}

export interface CreateStageChangeActivityInput {
  dealId: string;
  contactId?: string | null;
  companyId?: string | null;
  dealTitle?: string | null;
  fromStage: string;
  toStage: string;
  createdBy?: string | null;
}

export type CallOutcome = "completed" | "no_answer" | "busy" | "voicemail" | "wrong_number";

export interface CreateCallActivityInput {
  contactId?: string | null;
  companyId?: string | null;
  dealId?: string | null;
  direction: "in" | "out";
  durationSeconds?: number | null;
  outcome?: CallOutcome | null;
  body?: string | null;
  occurredAt?: string | null;
  createdBy?: string | null;
}

export interface CreateTaskActivityInput {
  contactId?: string | null;
  companyId?: string | null;
  dealId?: string | null;
  title: string;
  body?: string | null;
  dueDate?: string | null;   // YYYY-MM-DD
  assigneeId?: string | null;
  createdBy?: string | null;
}

export interface CreateMeetingActivityInput {
  contactId?: string | null;
  companyId?: string | null;
  dealId?: string | null;
  title: string;
  body?: string | null;
  occurredAt: string;
  location?: string | null;
  link?: string | null;
  createdBy?: string | null;
}

function applyOptions<T extends { order: (col: string, opts: { ascending: boolean }) => T; limit: (n: number) => T; in: (col: string, values: string[]) => T; lt: (col: string, value: string) => T }>(
  query: T,
  opts: ActivitiesQueryOptions | undefined,
): T {
  let q = query.order("occurred_at", { ascending: false });
  const limit = opts?.limit ?? 200;
  q = q.limit(limit);
  if (opts?.kinds && opts.kinds.length > 0) {
    q = q.in("kind", opts.kinds);
  }
  if (opts?.before) {
    q = q.lt("occurred_at", opts.before);
  }
  return q;
}

// ── Queries ──────────────────────────────────────────────

export async function getActivitiesForContact(
  contactId: string,
  opts?: ActivitiesQueryOptions,
): Promise<Activity[]> {
  const base = supabase.from("activities").select(ACTIVITY_SELECT).eq("contact_id", contactId);
  const { data, error } = await applyOptions(base, opts);
  if (error) throw error;
  return ((data ?? []) as unknown as ActivityRow[]).map(normalizeRow);
}

export async function getActivitiesForCompany(
  companyId: string,
  opts?: ActivitiesQueryOptions,
): Promise<Activity[]> {
  const base = supabase.from("activities").select(ACTIVITY_SELECT).eq("company_id", companyId);
  const { data, error } = await applyOptions(base, opts);
  if (error) throw error;
  return ((data ?? []) as unknown as ActivityRow[]).map(normalizeRow);
}

export async function getActivitiesForDeal(
  dealId: string,
  opts?: ActivitiesQueryOptions,
): Promise<Activity[]> {
  const base = supabase.from("activities").select(ACTIVITY_SELECT).eq("deal_id", dealId);
  const { data, error } = await applyOptions(base, opts);
  if (error) throw error;
  return ((data ?? []) as unknown as ActivityRow[]).map(normalizeRow);
}

export async function createNoteActivity(input: CreateNoteActivityInput): Promise<Activity> {
  const body = input.body.trim();
  if (!body) throw new Error("Nota vazia.");

  const payload = {
    source: "contact_detail_quick_action",
  };

  const { data, error } = await supabase
    .from("activities")
    .insert({
      kind: "note",
      subject: "Nota",
      body,
      direction: null,
      occurred_at: new Date().toISOString(),
      created_by: input.createdBy ?? null,
      contact_id: input.contactId ?? null,
      company_id: input.companyId ?? null,
      deal_id: input.dealId ?? null,
      payload,
    })
    .select(ACTIVITY_SELECT)
    .single();

  if (error) throw error;
  return normalizeRow(data as unknown as ActivityRow);
}

export async function createStageChangeActivity(
  input: CreateStageChangeActivityInput,
): Promise<Activity> {
  const payload = {
    source: "deal_detail_move_stage",
    deal_title: input.dealTitle ?? null,
    from_stage: input.fromStage,
    to_stage: input.toStage,
  };

  const { data, error } = await supabase
    .from("activities")
    .insert({
      kind: "stage_change",
      subject: "Mudança de estágio",
      body: `${input.dealTitle ?? "Deal"}: ${input.fromStage} → ${input.toStage}`,
      direction: null,
      occurred_at: new Date().toISOString(),
      created_by: input.createdBy ?? null,
      contact_id: input.contactId ?? null,
      company_id: input.companyId ?? null,
      deal_id: input.dealId,
      payload,
    })
    .select(ACTIVITY_SELECT)
    .single();

  if (error) throw error;
  return normalizeRow(data as unknown as ActivityRow);
}

export async function createCallActivity(input: CreateCallActivityInput): Promise<Activity> {
  const payload = {
    source: "quick_action_log_call",
    duration_seconds: input.durationSeconds ?? null,
    outcome: input.outcome ?? null,
  };

  const { data, error } = await supabase
    .from("activities")
    .insert({
      kind: "call",
      subject: input.direction === "out" ? "Ligação feita" : "Ligação recebida",
      body: input.body ?? null,
      direction: input.direction,
      occurred_at: input.occurredAt ?? new Date().toISOString(),
      created_by: input.createdBy ?? null,
      contact_id: input.contactId ?? null,
      company_id: input.companyId ?? null,
      deal_id: input.dealId ?? null,
      payload,
    })
    .select(ACTIVITY_SELECT)
    .single();

  if (error) throw error;
  return normalizeRow(data as unknown as ActivityRow);
}

export async function createTaskActivity(input: CreateTaskActivityInput): Promise<Activity> {
  const title = input.title.trim();
  if (!title) throw new Error("Título da tarefa vazio.");

  const payload = {
    source: "quick_action_create_task",
    due_date: input.dueDate ?? null,
    assignee_id: input.assigneeId ?? null,
    status: "pending",
  };

  const { data, error } = await supabase
    .from("activities")
    .insert({
      kind: "task",
      subject: title,
      body: input.body ?? null,
      direction: null,
      occurred_at: new Date().toISOString(),
      created_by: input.createdBy ?? null,
      contact_id: input.contactId ?? null,
      company_id: input.companyId ?? null,
      deal_id: input.dealId ?? null,
      payload,
    })
    .select(ACTIVITY_SELECT)
    .single();

  if (error) throw error;
  return normalizeRow(data as unknown as ActivityRow);
}

export async function createMeetingActivity(input: CreateMeetingActivityInput): Promise<Activity> {
  const title = input.title.trim();
  if (!title) throw new Error("Título da reunião vazio.");

  const payload = {
    source: "quick_action_log_meeting",
    location: input.location ?? null,
    link: input.link ?? null,
  };

  const { data, error } = await supabase
    .from("activities")
    .insert({
      kind: "meeting",
      subject: title,
      body: input.body ?? null,
      direction: null,
      occurred_at: input.occurredAt,
      created_by: input.createdBy ?? null,
      contact_id: input.contactId ?? null,
      company_id: input.companyId ?? null,
      deal_id: input.dealId ?? null,
      payload,
    })
    .select(ACTIVITY_SELECT)
    .single();

  if (error) throw error;
  return normalizeRow(data as unknown as ActivityRow);
}

export interface CreatePropertyChangeActivityInput {
  contactId?: string | null;
  companyId?: string | null;
  dealId?: string | null;
  recordType: "contact" | "company" | "deal";
  field: string;
  oldValue: string | number | null | undefined;
  newValue: string | number | null | undefined;
  createdBy?: string | null;
}

export async function createPropertyChangeActivity(
  input: CreatePropertyChangeActivityInput,
): Promise<Activity> {
  const oldStr = input.oldValue == null ? null : String(input.oldValue);
  const newStr = input.newValue == null ? null : String(input.newValue);

  const payload = {
    source: "inline_edit",
    record_type: input.recordType,
    field: input.field,
    old: oldStr,
    new: newStr,
  };

  const { data, error } = await supabase
    .from("activities")
    .insert({
      kind: "property_change",
      subject: `${input.field}: ${oldStr ?? "—"} → ${newStr ?? "—"}`,
      body: null,
      direction: null,
      occurred_at: new Date().toISOString(),
      created_by: input.createdBy ?? null,
      contact_id: input.contactId ?? null,
      company_id: input.companyId ?? null,
      deal_id: input.dealId ?? null,
      payload,
    })
    .select(ACTIVITY_SELECT)
    .single();

  if (error) throw error;
  return normalizeRow(data as unknown as ActivityRow);
}

export interface UpdateRecordFieldInput {
  table: "contacts" | "companies" | "deals";
  id: string;
  field: string;
  oldValue: string | number | null | undefined;
  newValue: string | number | null | undefined;
  createdBy?: string | null;
  /** Para popular o activity criado em paralelo. */
  scope?: {
    contactId?: string | null;
    companyId?: string | null;
    dealId?: string | null;
  };
}

/**
 * Atualiza um campo de contact/company/deal e cria activity kind='property_change'
 * automaticamente. Usado pelo `<InlineEdit />` na sidebar de propriedades.
 *
 * Não cria activity se newValue == oldValue (no-op).
 */
export async function updateRecordField(input: UpdateRecordFieldInput): Promise<void> {
  if (input.oldValue === input.newValue) return;

  const { error: updateErr } = await supabase
    .from(input.table)
    .update({ [input.field]: input.newValue })
    .eq("id", input.id);
  if (updateErr) throw updateErr;

  const recordType =
    input.table === "contacts" ? "contact" : input.table === "companies" ? "company" : "deal";

  const scope = input.scope ?? {};
  const baseScope = {
    contactId: scope.contactId ?? (input.table === "contacts" ? input.id : null),
    companyId: scope.companyId ?? (input.table === "companies" ? input.id : null),
    dealId: scope.dealId ?? (input.table === "deals" ? input.id : null),
  };

  try {
    await createPropertyChangeActivity({
      ...baseScope,
      recordType,
      field: input.field,
      oldValue: input.oldValue,
      newValue: input.newValue,
      createdBy: input.createdBy ?? null,
    });
  } catch (error) {
    // Se a activity falhar (ex: tabela sem permissão), logamos mas não desfaz o update.
    console.warn("[activitiesService] property_change activity falhou:", error);
  }
}

export async function setTaskStatus(
  activityId: string,
  status: "pending" | "done" | "skipped",
): Promise<void> {
  const { data: current, error: readErr } = await supabase
    .from("activities")
    .select("payload")
    .eq("id", activityId)
    .single();
  if (readErr) throw readErr;

  const oldPayload = (current?.payload ?? {}) as Record<string, unknown>;
  const newPayload = { ...oldPayload, status };

  const { error: updateErr } = await supabase
    .from("activities")
    .update({ payload: newPayload })
    .eq("id", activityId);
  if (updateErr) throw updateErr;
}
