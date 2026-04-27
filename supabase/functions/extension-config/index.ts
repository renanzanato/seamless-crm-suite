import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
};

const DEFAULT_CONFIG = {
  selectors: {},
  selectors_checksum: "default",
  rate_limits: { per_minute: 30, per_hour: 200, per_day: 800 },
  kill_switch: false,
  passive_mode: false,
  business_hours: {
    start: "09:00",
    end: "18:00",
    timezone: "America/Sao_Paulo",
    days: [1, 2, 3, 4, 5],
  },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function configPatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.kill_switch === "boolean") patch.kill_switch = body.kill_switch;
  if (typeof body.passive_mode === "boolean") patch.passive_mode = body.passive_mode;
  if (body.rate_limits && typeof body.rate_limits === "object") patch.rate_limits = body.rate_limits;
  if (body.business_hours && typeof body.business_hours === "object") patch.business_hours = body.business_hours;
  if (body.selectors && typeof body.selectors === "object") patch.selectors = body.selectors;
  if (typeof body.selectors_checksum === "string") patch.selectors_checksum = body.selectors_checksum;
  return patch;
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

async function ensureConfig(db: ReturnType<typeof createClient>, accountId: string) {
  const { data, error } = await db
    .from("extension_config")
    .select("*")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;

  const { data: inserted, error: insertError } = await db
    .from("extension_config")
    .insert({ account_id: accountId, ...DEFAULT_CONFIG })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return inserted;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET" && req.method !== "PATCH") {
    return json({ error_code: "METHOD_NOT_ALLOWED" }, 405);
  }

  try {
    const actor = await authenticate(req);
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    if (req.method === "PATCH") {
      const body = await req.json().catch(() => ({})) as Record<string, unknown>;
      const patch = configPatch(body);
      const current = await ensureConfig(db, actor.accountId);
      const { data, error } = await db
        .from("extension_config")
        .update(patch)
        .eq("id", current.id)
        .select("*")
        .single();
      if (error) throw error;
      return json({ ok: true, config: data });
    }

    const config = await ensureConfig(db, actor.accountId);
    return json({
      ...DEFAULT_CONFIG,
      ...config,
      server_time: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "UNAUTHORIZED") return json({ error_code: "UNAUTHORIZED" }, 401);
    console.error("[extension-config]", message);
    return json({ error_code: "CONFIG_FAILED", message }, 500);
  }
});
