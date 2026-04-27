import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function authorized(req: Request) {
  return !CRON_SECRET || req.headers.get("x-cron-secret") === CRON_SECRET;
}

function stageName(row: Record<string, unknown>) {
  const stage = row.stage_ref;
  if (Array.isArray(stage)) return typeof stage[0]?.name === "string" ? stage[0].name : null;
  if (stage && typeof stage === "object" && typeof (stage as Record<string, unknown>).name === "string") {
    return (stage as Record<string, unknown>).name as string;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error_code: "METHOD_NOT_ALLOWED" }, 405);
  if (!authorized(req)) return json({ error_code: "UNAUTHORIZED" }, 401);

  const startedAt = Date.now();
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const snapshotDate = typeof body.snapshot_date === "string"
    ? body.snapshot_date
    : new Date().toISOString().slice(0, 10);

  try {
    let { data: deals, error } = await db
      .from("deals")
      .select("id, value, owner_id, momentum_score, stage_ref:stages(name)");

    if (error) {
      const fallback = await db
        .from("deals")
        .select("id, value, owner_id, momentum_score, stage_id");
      deals = fallback.data;
      error = fallback.error;
    }

    if (error) throw error;

    const rows = (deals ?? [])
      .filter((deal: Record<string, unknown>) => typeof deal.owner_id === "string")
      .map((deal: Record<string, unknown>) => ({
        account_id: deal.owner_id,
        snapshot_date: snapshotDate,
        deal_id: deal.id,
        stage: stageName(deal) ?? (typeof deal.stage_id === "string" ? deal.stage_id : null),
        value_brl: typeof deal.value === "number" ? deal.value : null,
        owner_id: deal.owner_id,
        momentum: typeof deal.momentum_score === "number" ? deal.momentum_score : 0,
      }));

    if (rows.length) {
      const { error: upsertError } = await db
        .from("deal_state_snapshots")
        .upsert(rows, { onConflict: "snapshot_date,deal_id" });
      if (upsertError) throw upsertError;
    }

    return json({
      ok: true,
      snapshot_date: snapshotDate,
      captured: rows.length,
      latency_ms: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[snapshot-deals]", message);
    return json({ error_code: "SNAPSHOT_DEALS_FAILED", message }, 500);
  }
});
