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

const THRESHOLD_BY_TIER: Record<string, number> = {
  tier_1: 3,
  tier_2: 7,
  tier_3: 14,
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

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function company(row: Record<string, unknown>) {
  const companyValue = row.company;
  if (Array.isArray(companyValue)) return companyValue[0] as Record<string, unknown> | undefined;
  return companyValue && typeof companyValue === "object"
    ? companyValue as Record<string, unknown>
    : undefined;
}

async function hasTask(db: ReturnType<typeof createClient>, companyId: string, dueDate: string) {
  const { data, error } = await db
    .from("daily_tasks")
    .select("id")
    .eq("company_id", companyId)
    .eq("task_type", "followup")
    .eq("due_date", dueDate)
    .eq("status", "pending")
    .ilike("generated_message", "%reanimar conta%")
    .limit(1);

  if (error) {
    console.warn("[detect-slipping-deals] task lookup failed", error);
    return true;
  }
  return Boolean(data?.length);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error_code: "METHOD_NOT_ALLOWED" }, 405);
  if (!authorized(req)) return json({ error_code: "UNAUTHORIZED" }, 401);

  const startedAt = Date.now();
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const dueDate = todayIso();

  try {
    let { data: deals, error } = await db
      .from("deals")
      .select("id, title, company_id, contact_id, owner_id, aging_days, momentum_score, company:companies(id, name, account_tier)");

    if (error) {
      const fallback = await db
        .from("deals")
        .select("id, title, company_id, contact_id, owner_id, aging_days, momentum_score");
      deals = fallback.data;
      error = fallback.error;
    }
    if (error) throw error;

    let created = 0;
    let skipped = 0;

    for (const rawDeal of deals ?? []) {
      const deal = rawDeal as Record<string, unknown>;
      const companyId = text(deal.company_id);
      if (!companyId) {
        skipped += 1;
        continue;
      }

      const currentCompany = company(deal);
      const tier = text(currentCompany?.account_tier, "tier_2");
      const threshold = THRESHOLD_BY_TIER[tier] ?? THRESHOLD_BY_TIER.tier_2;
      const agingDays = Number(deal.aging_days ?? 0);
      if (!Number.isFinite(agingDays) || agingDays <= threshold) {
        skipped += 1;
        continue;
      }

      if (await hasTask(db, companyId, dueDate)) {
        skipped += 1;
        continue;
      }

      const companyName = text(currentCompany?.name, "conta");
      const title = text(deal.title, "negócio");
      const generatedMessage = `reanimar conta: ${companyName}. Negócio "${title}" está há ${agingDays} dias sem atividade relevante; retomar contato hoje.`;

      const { error: insertError } = await db
        .from("daily_tasks")
        .insert({
          company_id: companyId,
          contact_id: text(deal.contact_id) || null,
          task_type: "followup",
          persona_type: "other",
          generated_message: generatedMessage,
          urgency: agingDays >= threshold + 3 ? "urgent" : "today",
          due_date: dueDate,
          status: "pending",
        });

      if (insertError) {
        console.warn("[detect-slipping-deals] daily task insert failed", insertError);
        skipped += 1;
        continue;
      }

      created += 1;
    }

    return json({
      ok: true,
      created,
      skipped,
      latency_ms: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[detect-slipping-deals]", message);
    return json({ error_code: "DETECT_SLIPPING_DEALS_FAILED", message }, 500);
  }
});
