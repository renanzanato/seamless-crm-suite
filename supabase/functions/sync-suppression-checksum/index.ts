import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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
  if (req.method !== "GET") return json({ error_code: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const actor = await authenticate(req);
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data, error } = await db
      .from("suppression_list")
      .select("contact_id, wa_phone_e164, reason, expires_at")
      .eq("account_id", actor.accountId)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

    if (error) throw error;

    const entries = (data ?? [])
      .map((row) => [
        text(row.contact_id),
        text(row.wa_phone_e164),
        text(row.reason),
        text(row.expires_at),
      ].join(":"))
      .sort();

    const checksum = await sha256Hex(entries.join("|"));

    return json({
      ok: true,
      checksum,
      count: entries.length,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "UNAUTHORIZED") return json({ error_code: "UNAUTHORIZED" }, 401);
    console.error("[sync-suppression-checksum]", message);
    return json({ error_code: "SUPPRESSION_CHECKSUM_FAILED", message }, 500);
  }
});
