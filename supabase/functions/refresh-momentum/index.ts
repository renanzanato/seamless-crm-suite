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

function daysSince(value: unknown) {
  const date = typeof value === "string" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 999;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error_code: "METHOD_NOT_ALLOWED" }, 405);
  if (!authorized(req)) return json({ error_code: "UNAUTHORIZED" }, 401);

  const startedAt = Date.now();
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();

  try {
    const { data: deals, error } = await db
      .from("deals")
      .select("id, created_at, last_activity_at");
    if (error) throw error;

    let updated = 0;
    for (const deal of deals ?? []) {
      const dealId = (deal as Record<string, unknown>).id as string;
      const { count: activitiesCount, error: activitiesError } = await db
        .from("activities")
        .select("id", { count: "exact", head: true })
        .eq("deal_id", dealId)
        .gte("created_at", since);
      if (activitiesError) throw activitiesError;

      const { count: positiveCount, error: positiveError } = await db
        .from("activities")
        .select("id", { count: "exact", head: true })
        .eq("deal_id", dealId)
        .in("reply_classification", ["positive_intent", "meeting_requested"])
        .gte("created_at", since);
      if (positiveError) throw positiveError;

      const lastActivity = (deal as Record<string, unknown>).last_activity_at ??
        (deal as Record<string, unknown>).created_at;
      const agingDays = daysSince(lastActivity);
      const momentum = Math.max(0, Math.min(
        99.99,
        (activitiesCount ?? 0) * 2 + (positiveCount ?? 0) * 5 - agingDays * 0.5,
      ));

      const { error: updateError } = await db
        .from("deals")
        .update({
          aging_days: agingDays,
          momentum_score: Number(momentum.toFixed(2)),
        })
        .eq("id", dealId);
      if (updateError) throw updateError;
      updated += 1;
    }

    return json({
      ok: true,
      updated,
      latency_ms: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[refresh-momentum]", message);
    return json({ error_code: "REFRESH_MOMENTUM_FAILED", message }, 500);
  }
});
