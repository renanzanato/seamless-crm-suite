import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-6";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EXTRACTION_TYPES = [
  "next_step",
  "decision_maker_mentioned",
  "objection",
  "price_quoted",
  "date_agreed",
  "competitor_mentioned",
  "pain_point",
  "budget_signal",
  "timeline_signal",
] as const;

type ExtractionType = typeof EXTRACTION_TYPES[number];
type RiskLevel = "low" | "medium" | "high";
type SupabaseClient = ReturnType<typeof createClient>;

type Extraction = {
  extraction_type: ExtractionType;
  payload: Record<string, unknown>;
  confidence: number;
  risk_level: RiskLevel;
};

const SYSTEM_PROMPT = `Você é o extrator de fatos comerciais do Pipa Driven CRM.
Retorne somente JSON válido no formato:
{"extractions":[{"extraction_type":"next_step","payload":{"text":"..."},"confidence":0.9,"risk_level":"low"}]}

Tipos válidos:
next_step, decision_maker_mentioned, objection, price_quoted, date_agreed, competitor_mentioned, pain_point, budget_signal, timeline_signal.

Não invente fatos. Use risk_level=low apenas quando explícito.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T) {
  return allowed.includes(value as T) ? value as T : fallback;
}

function bodyText(activity: Record<string, unknown>) {
  const payload = (activity.payload && typeof activity.payload === "object"
    ? activity.payload
    : {}) as Record<string, unknown>;
  return [
    activity.body,
    activity.subject,
    payload.text,
    payload.body,
    payload.content,
    payload.caption,
    payload.transcript,
  ].map((entry) => text(entry)).find(Boolean) ?? "";
}

function parseBrazilianDate(raw: string) {
  const today = new Date();
  const lower = raw.toLowerCase();
  const match = lower.match(/(?:dia\s*)?(\d{1,2})(?:[/.-](\d{1,2})(?:[/.-](\d{2,4}))?)?/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = match[2] ? Number(match[2]) - 1 : today.getMonth();
  let year = match[3] ? Number(match[3]) : today.getFullYear();
  if (year < 100) year += 2000;

  const date = new Date(Date.UTC(year, month, day));
  if (Number.isNaN(date.getTime())) return null;

  if (!match[2] && date < today) {
    date.setUTCMonth(date.getUTCMonth() + 1);
  } else if (match[2] && date < today) {
    date.setUTCFullYear(date.getUTCFullYear() + 1);
  }

  return date.toISOString().slice(0, 10);
}

function sanitizeExtractions(value: unknown): Extraction[] {
  const raw = (value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).extractions))
    ? (value as Record<string, unknown>).extractions as unknown[]
    : Array.isArray(value) ? value : [];

  const seen = new Set<string>();
  const sanitized: Extraction[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const extractionType = enumValue(record.extraction_type, EXTRACTION_TYPES, "next_step");
    if (seen.has(extractionType)) continue;
    seen.add(extractionType);

    const confidence = clamp(record.confidence, 0, 1, 0.5);
    if (confidence < 0.55) continue;

    sanitized.push({
      extraction_type: extractionType,
      payload: record.payload && typeof record.payload === "object"
        ? record.payload as Record<string, unknown>
        : { text: text(record.payload) },
      confidence,
      risk_level: enumValue(record.risk_level, ["low", "medium", "high"] as const, "medium"),
    });
  }

  return sanitized;
}

function heuristicExtract(raw: string): Extraction[] {
  const normalized = raw.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const results: Extraction[] = [];

  const date = parseBrazilianDate(normalized);
  if (date && /\b(reuniao|agenda|call|retorno|volto|sexta|segunda|terca|quarta|quinta|amanha|hoje|dia|\d{1,2}[/.-]\d{1,2})\b/i.test(normalized)) {
    results.push({
      extraction_type: "date_agreed",
      payload: { date, text: raw },
      confidence: 0.82,
      risk_level: "low",
    });
  }

  if (/\b(enviar|mandar|retornar|ligar|agendar|marcar|proposta|apresentacao|demo|call)\b/i.test(normalized)) {
    results.push({
      extraction_type: "next_step",
      payload: { text: raw, due_date: date },
      confidence: date ? 0.86 : 0.72,
      risk_level: date ? "low" : "medium",
    });
  }

  const price = raw.match(/(?:R\$\s*)?\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?\s*(?:mil|k|m|reais|brl|m2|m²|vgv)?/i);
  if (price && /\b(r\$|preco|valor|orcamento|verba|fee|comissao|vgv|m2|m²)\b/i.test(normalized)) {
    results.push({
      extraction_type: "price_quoted",
      payload: { value_text: price[0], text: raw },
      confidence: 0.78,
      risk_level: "medium",
    });
  }

  if (/\b(caro|sem verba|sem orcamento|ja temos|nao faz sentido|nao e prioridade|muito alto|contrato atual)\b/i.test(normalized)) {
    results.push({
      extraction_type: "objection",
      payload: { text: raw },
      confidence: 0.8,
      risk_level: "medium",
    });
  }

  if (/\b(diretor|socio|ceo|cfo|gerente|responsavel|decisor|dona|dono)\b/i.test(normalized)) {
    results.push({
      extraction_type: "decision_maker_mentioned",
      payload: { text: raw },
      confidence: 0.72,
      risk_level: "medium",
    });
  }

  if (/\b(problema|dificuldade|dor|perdendo lead|demora|bagunca|sem controle|nao acompanha)\b/i.test(normalized)) {
    results.push({
      extraction_type: "pain_point",
      payload: { text: raw },
      confidence: 0.76,
      risk_level: "medium",
    });
  }

  return results;
}

async function callAnthropic(raw: string, context: Array<Record<string, unknown>>) {
  if (!ANTHROPIC_API_KEY) return null;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "x-api-key": ANTHROPIC_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 900,
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: JSON.stringify({ current_message: raw, last_messages: context }, null, 2),
      }],
    }),
  });

  if (!response.ok) throw new Error(`Anthropic error: ${await response.text()}`);
  const result = await response.json();
  const rawJson = result.content?.[0]?.text ?? "{\"extractions\":[]}";
  const match = rawJson.match(/\{[\s\S]*\}/);
  return sanitizeExtractions(JSON.parse(match ? match[0] : rawJson));
}

async function authenticate(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await authClient.auth.getUser();
  if (error || !data.user) throw new Error("UNAUTHORIZED");

  const metadata = {
    ...(data.user.app_metadata ?? {}),
    ...(data.user.user_metadata ?? {}),
  } as Record<string, unknown>;

  return {
    userId: data.user.id,
    accountId: text(metadata.account_id, data.user.id),
  };
}

async function loadContext(db: SupabaseClient, activity: Record<string, unknown>) {
  const contactId = text(activity.contact_id);
  if (!contactId) return [];

  const { data, error } = await db
    .from("activities")
    .select("id, direction, body, created_at, reply_classification")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.warn("[extract-conversation] context load failed", error);
    return [];
  }
  return data ?? [];
}

async function autoApply(db: SupabaseClient, activity: Record<string, unknown>, extractions: Extraction[]) {
  const dealId = text(activity.deal_id);
  if (!dealId) return 0;

  const patch: Record<string, unknown> = { last_extraction_at: new Date().toISOString() };
  let applied = 0;

  const nextStep = extractions.find((item) =>
    item.extraction_type === "next_step" &&
    item.risk_level === "low" &&
    item.confidence >= 0.85
  );
  if (nextStep) {
    patch.next_step_text = text(nextStep.payload.text);
    if (text(nextStep.payload.due_date)) patch.next_step_due = text(nextStep.payload.due_date);
    applied += 1;
  }

  const dateAgreed = extractions.find((item) =>
    item.extraction_type === "date_agreed" &&
    item.risk_level === "low" &&
    item.confidence >= 0.85
  );
  if (dateAgreed) {
    patch.next_step_due = text(dateAgreed.payload.date) || text(dateAgreed.payload.due_date);
    applied += 1;
  }

  if (applied === 0) return 0;

  const { error } = await db
    .from("deals")
    .update(patch)
    .eq("id", dealId);

  if (error) {
    console.warn("[extract-conversation] auto apply failed", error);
    return 0;
  }

  return applied;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error_code: "METHOD_NOT_ALLOWED" }, 405);

  const startedAt = Date.now();

  try {
    const actor = await authenticate(req);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const activityId = text(body.activity_id);
    if (!activityId) return json({ error_code: "VALIDATION_ERROR", message: "activity_id is required" }, 400);

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: activity, error } = await db
      .from("activities")
      .select("*")
      .eq("id", activityId)
      .maybeSingle();

    if (error) throw error;
    if (!activity) return json({ error_code: "NOT_FOUND" }, 404);

    const raw = bodyText(activity);
    if (!raw) return json({ error_code: "VALIDATION_ERROR", message: "activity has no text body" }, 400);

    const context = await loadContext(db, activity);
    const extractions = await callAnthropic(raw, context).catch((llmError) => {
      console.warn("[extract-conversation] llm failed; using heuristic fallback", llmError);
      return null;
    }) ?? heuristicExtract(raw);

    const appliedCount = await autoApply(db, activity, extractions);
    const rows = extractions.map((item) => ({
      account_id: actor.accountId,
      activity_id: activityId,
      deal_id: text(activity.deal_id) || null,
      contact_id: text(activity.contact_id) || null,
      extraction_type: item.extraction_type,
      payload: item.payload,
      confidence: item.confidence,
      risk_level: item.risk_level,
      status: appliedCount > 0 && (item.extraction_type === "next_step" || item.extraction_type === "date_agreed")
        ? "auto_applied"
        : "pending",
      applied_at: appliedCount > 0 && (item.extraction_type === "next_step" || item.extraction_type === "date_agreed")
        ? new Date().toISOString()
        : null,
    }));

    if (rows.length) {
      const { error: upsertError } = await db
        .from("conversation_extractions")
        .upsert(rows, { onConflict: "activity_id,extraction_type" });
      if (upsertError) throw upsertError;
    }

    return json({
      ok: true,
      activity_id: activityId,
      extracted: rows.length,
      auto_applied: appliedCount,
      latency_ms: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "UNAUTHORIZED") return json({ error_code: "UNAUTHORIZED" }, 401);
    console.error("[extract-conversation]", message);
    return json({ error_code: "EXTRACT_CONVERSATION_FAILED", message }, 500);
  }
});
