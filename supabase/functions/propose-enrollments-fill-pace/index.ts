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

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function tableUnavailable(error: { code?: string } | null | undefined) {
  return ["42P01", "42703", "PGRST200", "PGRST204", "PGRST205"].includes(error?.code ?? "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error_code: "METHOD_NOT_ALLOWED" }, 405);
  if (!authorized(req)) return json({ error_code: "UNAUTHORIZED" }, 401);

  const startedAt = Date.now();
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const maxProposals = Math.min(200, Math.max(1, Math.trunc(Number(body.limit ?? 50) || 50)));

    const { data: sequences, error: sequencesError } = await db
      .from("sequences")
      .select("id, name, active, trigger_type")
      .eq("active", true);
    if (sequencesError) throw sequencesError;

    const candidateSequences = (sequences ?? [])
      .filter((sequence: Record<string, unknown>) => text(sequence.trigger_type, "manual") !== "stage_change");
    const usableSequences = candidateSequences.length > 0 ? candidateSequences : (sequences ?? []);
    const sequenceIds = usableSequences.map((sequence: Record<string, unknown>) => text(sequence.id)).filter(Boolean);
    if (sequenceIds.length === 0) {
      return json({ ok: true, created: 0, skipped: 0, reason: "no_active_sequences", latency_ms: Date.now() - startedAt });
    }

    const { data: steps, error: stepsError } = await db
      .from("sequence_steps_v2")
      .select("sequence_id")
      .in("sequence_id", sequenceIds);
    if (stepsError) throw stepsError;
    const sequencesWithSteps = new Set((steps ?? []).map((step: Record<string, unknown>) => text(step.sequence_id)));
    const selectedSequenceId = sequenceIds.find((sequenceId) => sequencesWithSteps.has(sequenceId));
    if (!selectedSequenceId) {
      return json({ ok: true, created: 0, skipped: 0, reason: "no_sequence_steps", latency_ms: Date.now() - startedAt });
    }

    const { data: contacts, error: contactsError } = await db
      .from("contacts")
      .select("id, name, owner_id, company_id, lifecycle_stage, created_at")
      .not("company_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(maxProposals * 4);
    if (contactsError) throw contactsError;

    const contactIds = (contacts ?? []).map((contact: Record<string, unknown>) => text(contact.id)).filter(Boolean);
    if (contactIds.length === 0) {
      return json({ ok: true, created: 0, skipped: 0, reason: "no_contacts", latency_ms: Date.now() - startedAt });
    }

    const { data: tracks, error: tracksError } = await db
      .from("cadence_tracks")
      .select("contact_id, sequence_id, status")
      .eq("sequence_id", selectedSequenceId)
      .in("contact_id", contactIds)
      .in("status", ["active", "paused"]);
    if (tracksError) throw tracksError;
    const activeContacts = new Set((tracks ?? []).map((track: Record<string, unknown>) => text(track.contact_id)));

    let suppressedContacts = new Set<string>();
    const suppression = await db
      .from("suppression_list")
      .select("contact_id")
      .in("contact_id", contactIds);
    if (suppression.error && !tableUnavailable(suppression.error)) throw suppression.error;
    if (!suppression.error) {
      suppressedContacts = new Set((suppression.data ?? []).map((entry: Record<string, unknown>) => text(entry.contact_id)));
    }

    const { data: existing, error: existingError } = await db
      .from("proposed_enrollments")
      .select("contact_id, sequence_id, status")
      .eq("sequence_id", selectedSequenceId)
      .in("contact_id", contactIds)
      .in("status", ["pending", "accepted"]);
    if (existingError) throw existingError;
    const alreadyProposed = new Set((existing ?? []).map((row: Record<string, unknown>) => text(row.contact_id)));

    const rows: Record<string, unknown>[] = [];
    let skipped = 0;

    for (const contact of contacts ?? []) {
      const row = contact as Record<string, unknown>;
      const contactId = text(row.id);
      if (!contactId) {
        skipped += 1;
        continue;
      }
      if (activeContacts.has(contactId) || suppressedContacts.has(contactId) || alreadyProposed.has(contactId)) {
        skipped += 1;
        continue;
      }

      rows.push({
        account_id: text(row.owner_id, "single-tenant"),
        contact_id: contactId,
        sequence_id: selectedSequenceId,
        reason: "Pace diario abaixo do alvo: contato elegivel sem cadencia ativa.",
        priority: text(row.lifecycle_stage) === "opportunity" ? 80 : 50,
        status: "pending",
      });

      if (rows.length >= maxProposals) break;
    }

    if (rows.length > 0) {
      const { error: insertError } = await db.from("proposed_enrollments").insert(rows);
      if (insertError) throw insertError;
    }

    return json({
      ok: true,
      created: rows.length,
      skipped,
      sequence_id: selectedSequenceId,
      latency_ms: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[propose-enrollments-fill-pace]", message);
    return json({ error_code: "PROPOSE_ENROLLMENTS_FAILED", message }, 500);
  }
});
