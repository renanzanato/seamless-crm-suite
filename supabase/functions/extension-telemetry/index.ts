import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,3}\)?[\s.-]?)?\d{4,5}[\s.-]?\d{4}/g;
const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const CNPJ_RE = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (typeof value === "string") {
    return value
      .replace(EMAIL_RE, "[email]")
      .replace(CNPJ_RE, "[cnpj]")
      .replace(CPF_RE, "[cpf]")
      .replace(PHONE_RE, "[phone]");
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => scrub(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 100)
        .map(([key, entry]) => [key, scrub(entry, depth + 1)]),
    );
  }
  return null;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error_code: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const actor = await authenticate(req);
    const body = await req.json().catch(() => []) as unknown;
    const events = (Array.isArray(body) ? body : [body]).slice(0, 100);
    const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();

    const rows = events.map((event) => {
      const record = (event && typeof event === "object" ? event : {}) as Record<string, unknown>;
      const extension = (record.extension && typeof record.extension === "object"
        ? record.extension
        : {}) as Record<string, unknown>;
      return {
        account_id: actor.accountId,
        user_id: actor.userId,
        account_hash: text(record.account_hash) || text(extension.account_hash) || null,
        event_type: text(record.event_type, "unknown"),
        payload: scrub(record.payload ?? record),
        request_id: requestId,
        created_at: text(record.created_at) || new Date().toISOString(),
      };
    });

    if (!rows.length) return json({ ok: true, inserted: 0 });

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { error } = await db.from("extension_telemetry").insert(rows);
    if (error) throw error;

    return json({ ok: true, inserted: rows.length, request_id: requestId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "UNAUTHORIZED") return json({ error_code: "UNAUTHORIZED" }, 401);
    console.error("[extension-telemetry]", message);
    return json({ error_code: "TELEMETRY_FAILED", message }, 500);
  }
});
