import { supabase } from "@/lib/supabase";
import { addDays, isWorkingDay, toDateKey } from "@/lib/brCalendar";
import { inferPersonaFromRole, personalizeTemplate, PIPA_21_DAY_CADENCE } from "@/lib/pipaGtm";

// ── Types ────────────────────────────────────────────────

export type BuyingSignal = "hot" | "warm" | "cold";
export type CadenceStatus =
  | "not_started"
  | "active"
  | "paused"
  | "meeting_booked"
  | "proposal_sent"
  | "won"
  | "lost";
export type CadenceTrackStatus =
  | "pending"
  | "done"
  | "skipped"
  | "replied"
  | "active"
  | "paused"
  | "completed"
  | "meeting_booked"
  | "proposal_sent"
  | "won"
  | "lost"
  | "errored";
export type PersonaType = "cmo" | "dir_comercial" | "socio" | "ceo" | "other";
export type TaskType =
  | "send_whatsapp"
  | "send_linkedin"
  | "make_call"
  | "send_email"
  | "followup";
export type Urgency = "urgent" | "today" | "normal";

export interface DailyTask {
  id: string;
  company_id: string;
  contact_id: string | null;
  cadence_track_id: string | null;
  task_type: TaskType;
  persona_type: PersonaType | null;
  cadence_day: number | null;
  block_number: number | null;
  generated_message: string | null;
  urgency: Urgency;
  due_date: string;
  status: "pending" | "done" | "skipped";
  done_at: string | null;
  created_at: string;
  company?: { name: string; buying_signal: BuyingSignal };
  contact?: { name: string; whatsapp: string | null };
}

export interface CadenceTrack {
  id: string;
  company_id: string;
  contact_id: string | null;
  owner_id: string | null;
  persona_type: PersonaType;
  cadence_day: number;
  block_number: number;
  channel: "whatsapp" | "linkedin" | "phone" | "email";
  status: CadenceTrackStatus;
  scheduled_for: string | null;
  completed_at: string | null;
  message_sent: string | null;
  reply_received: string | null;
  enrolled_at: string | null;
  created_at: string;
  updated_at: string | null;
  company?: { id: string; name: string; buying_signal: BuyingSignal; cadence_status: string | null; cadence_day: number | null };
  contact?: { id: string; name: string; role: string | null; whatsapp: string | null; email: string | null } | null;
}

export interface AccountSignal {
  id: string;
  company_id: string;
  signal_type: string;
  description: string | null;
  detected_at: string;
  source: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface ActivityInteraction {
  id: string;
  company_id: string | null;
  contact_id: string | null;
  deal_id: string | null;
  interaction_type: string;
  content: string | null;
  summary: string | null;
  channel: string | null;
  direction: "outbound" | "inbound" | null;
  persona_type: PersonaType | null;
  cadence_day: number | null;
  created_by: string | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
  contact?: { name: string } | null;
}

export interface Phase0Result {
  id: string;
  company_id: string;
  test_date: string;
  first_response_minutes: number | null;
  followup_count: number;
  followup_days: number;
  response_quality: "excellent" | "good" | "poor" | "none" | null;
  diagnosis: string | null;
  loom_url: string | null;
  raw_notes: string | null;
  created_at: string;
}

// ── Daily Tasks ──────────────────────────────────────────

export async function getDailyTasks(date?: string): Promise<DailyTask[]> {
  const today = date || new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("daily_tasks")
    .select(
      `*, company:companies(name, buying_signal), contact:contacts(name, whatsapp)`
    )
    .lte("due_date", today)
    .eq("status", "pending")
    .order("urgency", { ascending: true })
    .order("due_date", { ascending: true });

  if (error) {
    console.warn("[abmService] daily_tasks unavailable:", error.message);
    return [];
  }
  return data || [];
}

export async function completeTask(id: string): Promise<void> {
  const { error } = await supabase
    .from("daily_tasks")
    .update({ status: "done", done_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function skipTask(id: string): Promise<void> {
  const { error } = await supabase
    .from("daily_tasks")
    .update({ status: "skipped" })
    .eq("id", id);
  if (error) throw error;
}

export async function createTask(
  payload: Omit<DailyTask, "id" | "created_at" | "done_at" | "company" | "contact">
): Promise<DailyTask> {
  const { data, error } = await supabase
    .from("daily_tasks")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Legacy interaction facade backed by activities ───────

function activityKindToActivityType(kind: string, payload: Record<string, unknown>) {
  if (typeof payload.interaction_type === "string") return payload.interaction_type;
  if (kind === "sequence_step") return "cadence_step";
  return kind;
}

function activityTypeToActivityKind(type: string) {
  if (type.includes("whatsapp")) return "whatsapp";
  if (type.includes("email")) return "email";
  if (type.includes("call")) return "call";
  if (type === "meeting") return "meeting";
  if (type === "cadence_step") return "sequence_step";
  return "note";
}

function activityDirectionFromLegacyValue(direction: ActivityInteraction["direction"]) {
  if (direction === "inbound") return "in";
  if (direction === "outbound") return "out";
  return null;
}

function activityDirectionToDisplayValue(direction: "in" | "out" | null) {
  if (direction === "in") return "inbound";
  if (direction === "out") return "outbound";
  return null;
}

export async function getCompanyActivities(
  companyId: string,
  limit = 50
): Promise<ActivityInteraction[]> {
  const { data, error } = await supabase
    .from("activities")
    .select("id, company_id, contact_id, deal_id, kind, subject, body, direction, occurred_at, created_by, payload, contact:contacts(name)")
    .eq("company_id", companyId)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[abmService] activities fallback unavailable:", error.message);
    return [];
  }

  return (data ?? []).map((activity) => {
    const payload = (activity.payload ?? {}) as Record<string, unknown>;
    return {
      id: activity.id,
      company_id: activity.company_id,
      contact_id: activity.contact_id,
      deal_id: activity.deal_id,
      interaction_type: activityKindToActivityType(activity.kind, payload),
      content: activity.body,
      summary: activity.subject,
      channel: String(payload.channel ?? activity.kind),
      direction: activityDirectionToDisplayValue(activity.direction),
      persona_type: (payload.persona_type as PersonaType | null) ?? null,
      cadence_day: typeof payload.cadence_day === "number" ? payload.cadence_day : null,
      created_by: activity.created_by,
      created_at: activity.occurred_at,
      metadata: payload,
      contact: activity.contact as { name: string } | null,
    };
  });
}

export async function logCompanyActivity(
  payload: Omit<ActivityInteraction, "id" | "created_at" | "contact">
): Promise<ActivityInteraction> {
  const kind = activityTypeToActivityKind(payload.interaction_type);
  const direction = activityDirectionFromLegacyValue(payload.direction);
  const { data, error } = await supabase
    .from("activities")
    .insert({
      kind,
      subject: payload.summary,
      body: payload.content,
      direction,
      occurred_at: new Date().toISOString(),
      created_by: payload.created_by,
      contact_id: payload.contact_id,
      company_id: payload.company_id,
      deal_id: payload.deal_id,
      payload: {
        ...payload.metadata,
        source: "company_activity_facade",
        interaction_type: payload.interaction_type,
        channel: payload.channel,
        persona_type: payload.persona_type,
        cadence_day: payload.cadence_day,
      },
    })
    .select("id, company_id, contact_id, deal_id, kind, subject, body, direction, occurred_at, created_by, payload")
    .single();
  if (error) throw error;
  const activityPayload = (data.payload ?? {}) as Record<string, unknown>;
  return {
    id: data.id,
    company_id: data.company_id,
    contact_id: data.contact_id,
    deal_id: data.deal_id,
    interaction_type: activityKindToActivityType(data.kind, activityPayload),
    content: data.body,
    summary: data.subject,
    channel: String(activityPayload.channel ?? data.kind),
    direction: activityDirectionToDisplayValue(data.direction),
    persona_type: (activityPayload.persona_type as PersonaType | null) ?? null,
    cadence_day: typeof activityPayload.cadence_day === "number" ? activityPayload.cadence_day : null,
    created_by: data.created_by,
    created_at: data.occurred_at,
    metadata: activityPayload,
  };
}

// ── Account Signals ──────────────────────────────────────

export async function getSignals(companyId: string): Promise<AccountSignal[]> {
  const { data, error } = await supabase
    .from("account_signals")
    .select("*")
    .eq("company_id", companyId)
    .order("detected_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function addSignal(
  companyId: string,
  signalType: string,
  description?: string,
  source = "manual"
): Promise<AccountSignal> {
  const { data, error } = await supabase
    .from("account_signals")
    .insert({ company_id: companyId, signal_type: signalType, description, source })
    .select()
    .single();
  if (error) throw error;

  // Recalculate score
  await supabase.rpc("recalculate_buying_signal", { p_company_id: companyId });

  return data;
}

// ── Phase 0 ──────────────────────────────────────────────

export async function savePhase0(
  payload: Omit<Phase0Result, "id" | "created_at">
): Promise<Phase0Result> {
  const { data, error } = await supabase
    .from("phase0_results")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;

  // Adicionar sinal automaticamente
  if (payload.first_response_minutes && payload.first_response_minutes > 60) {
    await addSignal(payload.company_id, "slow_response",
      `Respondeu em ${payload.first_response_minutes}min`, "phase0");
  }
  if (payload.followup_count === 0) {
    await addSignal(payload.company_id, "no_followup",
      "Nenhum follow-up em 5 dias", "phase0");
  }

  return data;
}

export async function getPhase0(companyId: string): Promise<Phase0Result | null> {
  const { data } = await supabase
    .from("phase0_results")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

// ── Cadence ──────────────────────────────────────────────

export async function startCadence(companyId: string): Promise<void> {
  const today = new Date().toISOString().split("T")[0];
  const { error } = await supabase
    .from("companies")
    .update({
      cadence_status: "active",
      cadence_day: 1,
      cadence_started_at: new Date().toISOString(),
    })
    .eq("id", companyId);
  if (error) throw error;

  // Gerar tarefas iniciais (Dia 1 — Bloco 1)
  const personas: PersonaType[] = ["cmo", "dir_comercial"];
  for (const persona of personas) {
    await supabase.from("daily_tasks").insert({
      company_id: companyId,
      task_type: "send_whatsapp",
      persona_type: persona,
      cadence_day: 1,
      block_number: 1,
      urgency: "today",
      due_date: today,
    });
    await supabase.from("daily_tasks").insert({
      company_id: companyId,
      task_type: "send_linkedin",
      persona_type: persona,
      cadence_day: 1,
      block_number: 1,
      urgency: "today",
      due_date: today,
    });
  }
}

export interface CadenceContactTarget {
  id: string;
  name: string;
  role: string | null;
}

export interface StartAccountCadencePayload {
  companyId: string;
  companyName: string;
  contacts: CadenceContactTarget[];
  startDate?: Date;
}

function nextWorkingDate(date: Date) {
  let cursor = date;
  while (!isWorkingDay(cursor)) {
    cursor = addDays(cursor, 1);
  }
  return cursor;
}

function dueDateForCadenceDay(startDate: Date, cadenceDay: number) {
  return toDateKey(nextWorkingDate(addDays(startDate, cadenceDay - 1)));
}

function getTrackCadenceDay(enrolledAt: string | null | undefined, today = new Date()) {
  if (!enrolledAt) return 1;
  const enrolled = new Date(enrolledAt);
  if (Number.isNaN(enrolled.getTime())) return 1;

  const start = nextWorkingDate(enrolled);
  const todayKey = toDateKey(today);
  let count = 0;

  for (let cursor = start; toDateKey(cursor) <= todayKey; cursor = addDays(cursor, 1)) {
    if (isWorkingDay(cursor)) count += 1;
  }

  return Math.max(1, Math.min(count || 1, 21));
}

async function createDueTasksForTrack(
  track: Pick<CadenceTrack, "id" | "company_id" | "contact_id" | "persona_type" | "enrolled_at"> & {
    contactName: string;
    companyName: string;
  },
  cadenceDay: number,
) {
  const steps = PIPA_21_DAY_CADENCE.filter(
    (step) => step.day === cadenceDay && step.personas.includes(track.persona_type),
  );
  if (steps.length === 0) return 0;

  const { data: existing, error: existingError } = await supabase
    .from("daily_tasks")
    .select("task_type")
    .eq("cadence_track_id", track.id)
    .eq("cadence_day", cadenceDay);
  if (existingError) throw existingError;

  const existingTypes = new Set((existing ?? []).map((row) => row.task_type));
  const startDate = track.enrolled_at ? new Date(track.enrolled_at) : new Date();
  const dueDate = dueDateForCadenceDay(startDate, cadenceDay);

  const tasks = steps
    .filter((step) => !existingTypes.has(step.taskType))
    .map((step) => ({
      company_id: track.company_id,
      contact_id: track.contact_id,
      cadence_track_id: track.id,
      task_type: step.taskType,
      persona_type: track.persona_type,
      cadence_day: step.day,
      block_number: step.block,
      generated_message: personalizeTemplate(step.message, {
        name: track.contactName,
        company: track.companyName,
      }),
      urgency: step.day === 1 ? "today" : "normal",
      due_date: dueDate,
      status: "pending",
    }));

  if (tasks.length === 0) return 0;

  const { error } = await supabase.from("daily_tasks").insert(tasks);
  if (error) throw error;
  return tasks.length;
}

export async function getCadenceTracks(): Promise<CadenceTrack[]> {
  const { data, error } = await supabase
    .from("cadence_tracks")
    .select(`
      id, company_id, contact_id, owner_id, persona_type, cadence_day, block_number, channel,
      status, scheduled_for, completed_at, message_sent, reply_received,
      enrolled_at, created_at, updated_at,
      company:companies(id, name, buying_signal, cadence_status, cadence_day),
      contact:contacts(id, name, role, whatsapp, email)
    `)
    .order("enrolled_at", { ascending: false });
  if (error) {
    console.warn("[abmService] cadence_tracks unavailable:", error.message);
    return [];
  }
  return (data ?? []) as CadenceTrack[];
}

export async function setCadenceTrackStatus(
  trackId: string,
  status: Extract<CadenceTrackStatus, "active" | "paused" | "completed" | "meeting_booked" | "proposal_sent" | "won" | "lost">,
): Promise<void> {
  const terminal = ["completed", "meeting_booked", "proposal_sent", "won", "lost"].includes(status);
  const { error } = await supabase
    .from("cadence_tracks")
    .update({
      status,
      completed_at: terminal ? new Date().toISOString() : null,
    })
    .eq("id", trackId);
  if (error) throw error;
}

export async function runSequenceWorker(): Promise<unknown> {
  const v2 = await supabase.functions.invoke("sequence-worker-v2", {
    body: { force: true },
  });
  if (!v2.error) return v2.data;

  console.warn("[abmService] sequence-worker-v2 failed, trying legacy worker:", v2.error.message);
  const legacy = await supabase.functions.invoke("sequence-worker", {
    body: { force: true },
  });
  if (legacy.error) {
    throw new Error(`Worker v2: ${v2.error.message}; worker legado: ${legacy.error.message}`);
  }
  return legacy.data;
}

export async function startCadenceForContacts(payload: StartAccountCadencePayload): Promise<number> {
  if (!payload.companyId) throw new Error("Selecione uma conta.");
  if (payload.contacts.length < 1) {
    throw new Error("Selecione pelo menos 1 pessoa da conta para iniciar a sequencia.");
  }

  const startDate = payload.startDate ?? new Date();
  const contactsWithPersona = payload.contacts.map((contact) => ({
    ...contact,
    persona: inferPersonaFromRole(contact.role),
  }));

  const contactsInTemplate = contactsWithPersona.filter((contact) =>
    PIPA_21_DAY_CADENCE.some((step) => step.personas.includes(contact.persona)),
  );

  if (contactsInTemplate.length === 0) {
    throw new Error("As pessoas selecionadas precisam ter cargos de marketing, comercial ou C-Level.");
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name, owner_id")
    .eq("id", payload.companyId)
    .single();
  if (companyError) throw companyError;

  const contactIds = contactsInTemplate.map((contact) => contact.id);
  const { data: existingTracks, error: existingError } = await supabase
    .from("cadence_tracks")
    .select("id, contact_id, status")
    .eq("company_id", payload.companyId)
    .in("contact_id", contactIds)
    .in("status", ["active", "paused"]);
  if (existingError) throw existingError;

  const existingByContact = new Map((existingTracks ?? []).map((track) => [track.contact_id, track]));
  const tracksToInsert = contactsInTemplate
    .filter((contact) => !existingByContact.has(contact.id))
    .map((contact) => ({
      company_id: payload.companyId,
      contact_id: contact.id,
      owner_id: company.owner_id,
      persona_type: contact.persona,
      cadence_day: 1,
      block_number: 1,
      channel: "whatsapp",
      status: "active",
      scheduled_for: dueDateForCadenceDay(startDate, 1),
      enrolled_at: startDate.toISOString(),
    }));

  if (tracksToInsert.length > 0) {
    const { error: insertTracksError } = await supabase.from("cadence_tracks").insert(tracksToInsert);
    if (insertTracksError) throw insertTracksError;
  }

  const pausedIds = (existingTracks ?? [])
    .filter((track) => track.status === "paused")
    .map((track) => track.id);
  if (pausedIds.length > 0) {
    const { error: resumeError } = await supabase
      .from("cadence_tracks")
      .update({ status: "active", completed_at: null })
      .in("id", pausedIds);
    if (resumeError) throw resumeError;
  }

  const { data: activeTracks, error: activeError } = await supabase
    .from("cadence_tracks")
    .select("id, company_id, contact_id, persona_type, enrolled_at, contact:contacts(name)")
    .eq("company_id", payload.companyId)
    .in("contact_id", contactIds)
    .eq("status", "active");
  if (activeError) throw activeError;

  let createdTasks = 0;
  for (const track of activeTracks ?? []) {
    const contact = contactsInTemplate.find((item) => item.id === track.contact_id);
    if (!contact) continue;
    const cadenceDay = getTrackCadenceDay(track.enrolled_at, startDate);
    createdTasks += await createDueTasksForTrack({
      id: track.id,
      company_id: track.company_id,
      contact_id: track.contact_id,
      persona_type: track.persona_type,
      enrolled_at: track.enrolled_at,
      contactName: contact.name,
      companyName: payload.companyName || company.name,
    }, cadenceDay);
  }

  const { error: updateCompanyError } = await supabase
    .from("companies")
    .update({
      cadence_status: "active",
      cadence_day: 1,
      cadence_started_at: startDate.toISOString(),
    })
    .eq("id", payload.companyId);
  if (updateCompanyError) throw updateCompanyError;

  return createdTasks;
}

// ── Dashboard stats ──────────────────────────────────────

export async function getABMStats() {
  const today = new Date().toISOString().split("T")[0];
  const [pending, done, hot, active] = await Promise.all([
    supabase.from("daily_tasks").select("id", { count: "exact", head: true })
      .eq("status", "pending").lte("due_date", today),
    supabase.from("daily_tasks").select("id", { count: "exact", head: true })
      .eq("status", "done").gte("done_at", today),
    supabase.from("companies").select("id", { count: "exact", head: true })
      .eq("buying_signal", "hot"),
    supabase.from("companies").select("id", { count: "exact", head: true })
      .eq("cadence_status", "active"),
  ]);
  return {
    pendingToday: pending.error ? 0 : pending.count || 0,
    doneToday: done.error ? 0 : done.count || 0,
    hotAccounts: hot.error ? 0 : hot.count || 0,
    activeCadences: active.error ? 0 : active.count || 0,
  };
}
