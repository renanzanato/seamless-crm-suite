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

const CLASSES = [
  "positive_intent",
  "meeting_requested",
  "not_now",
  "not_interested",
  "out_of_office",
  "wrong_person",
  "referral",
  "unsubscribe_request",
  "unclear",
] as const;

type ReplyClassification = typeof CLASSES[number];
type SupabaseClient = ReturnType<typeof createClient>;

type Classification = {
  classification: ReplyClassification;
  confidence: number;
  sentiment: number;
  parsed_return_date: string | null;
  referral_hint: Record<string, unknown> | null;
  reason: string;
};

const SYSTEM_PROMPT = `Você é o classificador de respostas inbound do Pipa Driven CRM.
Retorne somente JSON válido, sem Markdown.

Classes válidas:
positive_intent, meeting_requested, not_now, not_interested, out_of_office, wrong_person, referral, unsubscribe_request, unclear.

Formato:
{
  "classification": "positive_intent",
  "confidence": 0.92,
  "sentiment": 0.8,
  "parsed_return_date": null,
  "referral_hint": null,
  "reason": "motivo curto"
}

Se confidence < 0.7, use unclear. Para out_of_office, extraia parsed_return_date em YYYY-MM-DD quando explícita.`;

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

function enumValue(value: unknown, fallback: ReplyClassification): ReplyClassification {
  return CLASSES.includes(value as ReplyClassification) ? value as ReplyClassification : fallback;
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

function phoneFromActivity(activity: Record<string, unknown>) {
  const payload = (activity.payload && typeof activity.payload === "object"
    ? activity.payload
    : {}) as Record<string, unknown>;
  return text(payload.wa_phone_e164) ||
    text(payload.phone_e164) ||
    text(payload.phone) ||
    text(payload.from) ||
    null;
}

function sanitize(value: Record<string, unknown>): Classification {
  const classification = enumValue(value.classification, "unclear");
  const confidence = clamp(value.confidence, 0, 1, 0.5);
  return {
    classification: confidence < 0.7 ? "unclear" : classification,
    confidence,
    sentiment: clamp(value.sentiment, -1, 1, 0),
    parsed_return_date: text(value.parsed_return_date) || null,
    referral_hint: value.referral_hint && typeof value.referral_hint === "object"
      ? value.referral_hint as Record<string, unknown>
      : null,
    reason: text(value.reason, "Classificação automática."),
  };
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

function heuristicClassify(raw: string): Classification {
  const value = raw.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

  const rules: Array<[ReplyClassification, RegExp, number, number, string]> = [
    ["unsubscribe_request", /\b(descadastrar|remover|pare de mandar|parar de mandar|nao me mande|tirar da lista|opt[- ]?out)\b/i, 0.96, -0.9, "Pedido de descadastro ou interrupção de mensagens."],
    ["out_of_office", /\b(ferias|fora do escritorio|ausente|licenca|volto|retorno|ate dia|ate \d{1,2}[/.-]\d{1,2})\b/i, 0.9, 0.05, "Mensagem indica ausência ou retorno futuro."],
    ["meeting_requested", /\b(reuniao|agenda|agendar|call|ligacao|me liga|vamos conversar|marcar um horario|pode ser amanha)\b/i, 0.9, 0.85, "Resposta pede conversa síncrona ou agenda."],
    ["wrong_person", /\b(nao sou responsavel|pessoa errada|nao cuido disso|nao sou eu|fale com|procure)\b/i, 0.88, -0.2, "Contato indicou que não é o responsável."],
    ["referral", /\b(o responsavel e|responsavel eh|fala com|fale com|contato e|procura o|procure o)\b/i, 0.84, 0.2, "Resposta aponta outro responsável."],
    ["not_interested", /\b(sem interesse|nao tenho interesse|nao interessa|nao obrigado|obrigado mas nao|nao queremos|ja temos solucao)\b/i, 0.92, -0.8, "Resposta rejeita a abordagem."],
    ["not_now", /\b(agora nao|mais pra frente|depois|proximo mes|no futuro|sem tempo|me chama depois)\b/i, 0.86, -0.1, "Resposta adia sem rejeitar definitivamente."],
    ["positive_intent", /\b(tenho interesse|quero entender|manda mais|pode enviar|vamos avancar|faz sentido|gostei|me explica|quero conhecer)\b/i, 0.88, 0.75, "Resposta demonstra interesse comercial."],
  ];

  for (const [classification, regex, confidence, sentiment, reason] of rules) {
    if (regex.test(value)) {
      return {
        classification,
        confidence,
        sentiment,
        parsed_return_date: classification === "out_of_office" ? parseBrazilianDate(value) : null,
        referral_hint: classification === "referral" || classification === "wrong_person" ? { raw_text: raw } : null,
        reason,
      };
    }
  }

  return {
    classification: "unclear",
    confidence: raw.trim().length < 12 ? 0.55 : 0.68,
    sentiment: 0,
    parsed_return_date: null,
    referral_hint: null,
    reason: "Resposta sem sinal comercial confiável.",
  };
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
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: JSON.stringify({ inbound_text: raw, last_messages: context }, null, 2),
      }],
    }),
  });

  if (!response.ok) throw new Error(`Anthropic error: ${await response.text()}`);
  const result = await response.json();
  const rawJson = result.content?.[0]?.text ?? "{}";
  const match = rawJson.match(/\{[\s\S]*\}/);
  return sanitize(JSON.parse(match ? match[0] : rawJson));
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
    .limit(5);

  if (error) {
    console.warn("[classify-reply] context load failed", error);
    return [];
  }
  return data ?? [];
}

async function suppressIfNeeded(
  db: SupabaseClient,
  actor: { userId: string; accountId: string },
  activity: Record<string, unknown>,
  classification: Classification,
) {
  const reasonMap: Partial<Record<ReplyClassification, string>> = {
    unsubscribe_request: "unsubscribe",
    not_interested: "not_interested",
    wrong_person: "wrong_person",
  };
  const reason = reasonMap[classification.classification];
  if (!reason) return false;

  const contactId = text(activity.contact_id) || null;
  const phone = phoneFromActivity(activity);
  if (!contactId && !phone) return false;

  let query = db
    .from("suppression_list")
    .select("id")
    .eq("account_id", actor.accountId)
    .limit(1);

  query = contactId ? query.eq("contact_id", contactId) : query.eq("wa_phone_e164", phone);

  const { data: existing, error: lookupError } = await query;
  if (lookupError) throw lookupError;
  if (existing?.length) return false;

  const { error } = await db.from("suppression_list").insert({
    account_id: actor.accountId,
    contact_id: contactId,
    wa_phone_e164: phone,
    reason,
    source_activity_id: text(activity.id),
    created_by: actor.userId,
  });
  if (error) throw error;
  return true;
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
    if (activity.classified_at && activity.classified_by === "human") {
      return json({ ok: true, skipped: true, reason: "human_override", activity_id: activityId });
    }

    const raw = bodyText(activity);
    if (!raw) return json({ error_code: "VALIDATION_ERROR", message: "activity has no text body" }, 400);

    const context = await loadContext(db, activity);
    const classification = await callAnthropic(raw, context).catch((llmError) => {
      console.warn("[classify-reply] llm failed; using heuristic fallback", llmError);
      return null;
    }) ?? heuristicClassify(raw);

    const { error: updateError } = await db
      .from("activities")
      .update({
        reply_classification: classification.classification,
        classification_confidence: classification.confidence,
        sentiment_score: classification.sentiment,
        parsed_return_date: classification.parsed_return_date,
        referral_contact_hint: classification.referral_hint,
        classified_at: new Date().toISOString(),
        classified_by: "auto",
      })
      .eq("id", activityId);
    if (updateError) throw updateError;

    const suppressed = await suppressIfNeeded(db, actor, activity, classification);

    return json({
      ok: true,
      activity_id: activityId,
      classification,
      suppressed,
      latency_ms: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "UNAUTHORIZED") return json({ error_code: "UNAUTHORIZED" }, 401);
    console.error("[classify-reply]", message);
    return json({ error_code: "CLASSIFY_REPLY_FAILED", message }, 500);
  }
});
