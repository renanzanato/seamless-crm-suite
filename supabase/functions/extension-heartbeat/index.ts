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

type ExtensionState = "healthy" | "degraded" | "passive" | "offline";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function state(value: unknown, queueDepth: number): ExtensionState {
  const raw = text(value);
  if (raw === "healthy" || raw === "degraded" || raw === "passive" || raw === "offline") return raw;
  return queueDepth > 200 ? "degraded" : "healthy";
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

  const startedAt = Date.now();

  try {
    const actor = await authenticate(req);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const queueDepth = Math.max(0, Math.trunc(Number(body.queue_depth ?? 0) || 0));
    const accountHash = text(body.account_hash, "unknown");

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { error } = await db
      .from("extension_status")
      .upsert({
        account_id: actor.accountId,
        user_id: actor.userId,
        account_hash: accountHash,
        ext_version: text(body.ext_version, "unknown"),
        wpp_version: text(body.wpp_version) || null,
        queue_depth: queueDepth,
        last_error: text(body.last_error) || null,
        state: state(body.state, queueDepth),
        last_heartbeat: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "account_id,user_id,account_hash" });

    if (error) throw error;

    const { data: config } = await db
      .from("extension_config")
      .select("kill_switch, passive_mode, rate_limits, business_hours, selectors_checksum")
      .eq("account_id", actor.accountId)
      .maybeSingle();

    return json({
      ok: true,
      server_time: new Date().toISOString(),
      kill_switch_active: Boolean(config?.kill_switch),
      passive_mode: Boolean(config?.passive_mode),
      latency_ms: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "UNAUTHORIZED") return json({ error_code: "UNAUTHORIZED" }, 401);
    console.error("[extension-heartbeat]", message);
    return json({ error_code: "HEARTBEAT_FAILED", message }, 500);
  }
});
