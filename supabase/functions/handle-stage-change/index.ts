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

type SupabaseClient = ReturnType<typeof createClient>;

type Actor = {
  userId: string;
  accountId: string;
};

type SequenceRow = {
  id: string;
  name: string;
  channel?: string | null;
  trigger_config?: Record<string, unknown> | null;
};

type TargetContact = {
  contact_id: string;
  role: string | null;
  name: string | null;
  buying_role: string | null;
  company_id: string | null;
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

function sameText(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function tableUnavailable(error: { code?: string } | null | undefined) {
  return ["42P01", "42703", "PGRST200", "PGRST204", "PGRST205"].includes(error?.code ?? "");
}

function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function inferPersona(role?: string | null) {
  const normalized = (role ?? "").toLowerCase();
  if (normalized.includes("cmo") || normalized.includes("marketing")) return "cmo";
  if (normalized.includes("comercial") || normalized.includes("vendas") || normalized.includes("sales")) {
    return "dir_comercial";
  }
  if (
    normalized.includes("socio") ||
    normalized.includes("sócio") ||
    normalized.includes("founder") ||
    normalized.includes("fundador")
  ) {
    return "socio";
  }
  if (normalized.includes("ceo") || normalized.includes("presidente")) return "ceo";
  return "other";
}

async function authenticate(req: Request): Promise<Actor> {
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

function sequenceMatchesStage(sequence: SequenceRow, stageId: string, stageName: string) {
  const config = sequence.trigger_config ?? {};
  const targetStageId = text(config.stage_id);
  const targetStageName = text(config.stage_name) || text(config.stage);
  return Boolean(
    (targetStageId && targetStageId === stageId) ||
      (targetStageName && stageName && sameText(targetStageName, stageName)),
  );
}

async function loadTargetContacts(
  db: SupabaseClient,
  deal: Record<string, unknown>,
): Promise<TargetContact[]> {
  const dealId = text(deal.id);
  const directContactId = text(deal.contact_id);
  const fallbackCompanyId = text(deal.company_id) || null;

  const committee = await db
    .from("deal_contacts")
    .select("contact_id, buying_role")
    .eq("deal_id", dealId)
    .is("removed_at", null);

  let entries = committee.data ?? [];
  if (committee.error && !tableUnavailable(committee.error)) throw committee.error;
  if (committee.error && tableUnavailable(committee.error)) entries = [];

  const contactIds = [...new Set(entries.map((row: Record<string, unknown>) => text(row.contact_id)).filter(Boolean))];
  if (contactIds.length === 0 && directContactId) contactIds.push(directContactId);
  if (contactIds.length === 0) return [];

  const { data: contacts, error } = await db
    .from("contacts")
    .select("id, name, role, company_id")
    .in("id", contactIds);
  if (error) throw error;

  const roleByContact = new Map(
    entries.map((row: Record<string, unknown>) => [text(row.contact_id), text(row.buying_role) || null]),
  );

  return (contacts ?? []).map((contact: Record<string, unknown>) => {
    const id = text(contact.id);
    return {
      contact_id: id,
      role: text(contact.role) || roleByContact.get(id) || null,
      name: text(contact.name) || null,
      buying_role: roleByContact.get(id) ?? null,
      company_id: text(contact.company_id) || fallbackCompanyId,
    };
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error_code: "METHOD_NOT_ALLOWED" }, 405);

  const startedAt = Date.now();

  try {
    const actor = await authenticate(req);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const dealId = text(body.deal_id);
    const nextStageId = text(body.next_stage_id);
    if (!dealId || !nextStageId) {
      return json({ error_code: "INVALID_PAYLOAD", message: "deal_id e next_stage_id sao obrigatorios." }, 400);
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: deal, error: dealError } = await db
      .from("deals")
      .select("id, title, company_id, contact_id, owner_id, stage_id")
      .eq("id", dealId)
      .maybeSingle();
    if (dealError) throw dealError;
    if (!deal) return json({ error_code: "DEAL_NOT_FOUND" }, 404);

    const { data: stage, error: stageError } = await db
      .from("stages")
      .select("id, name")
      .eq("id", nextStageId)
      .maybeSingle();
    if (stageError && !tableUnavailable(stageError)) throw stageError;
    const stageName = text((stage as Record<string, unknown> | null)?.name);

    const { data: sequences, error: seqError } = await db
      .from("sequences")
      .select("id, name, channel, trigger_config, active, trigger_type")
      .eq("active", true)
      .eq("trigger_type", "stage_change");
    if (seqError) throw seqError;

    const targetSequences = ((sequences ?? []) as SequenceRow[])
      .filter((sequence) => sequenceMatchesStage(sequence, nextStageId, stageName));
    if (targetSequences.length === 0) {
      return json({ ok: true, created: 0, skipped: 0, reason: "no_matching_sequence", latency_ms: Date.now() - startedAt });
    }

    const contacts = await loadTargetContacts(db, deal as Record<string, unknown>);
    if (contacts.length === 0) {
      return json({ ok: true, created: 0, skipped: 0, reason: "no_contacts", latency_ms: Date.now() - startedAt });
    }

    const sequenceIds = targetSequences.map((sequence) => sequence.id);
    const contactIds = contacts.map((contact) => contact.contact_id);

    const { data: steps, error: stepsError } = await db
      .from("sequence_steps_v2")
      .select("sequence_id, position")
      .in("sequence_id", sequenceIds)
      .order("position", { ascending: true });
    if (stepsError) throw stepsError;

    const firstPositionBySequence = new Map<string, number>();
    for (const step of steps ?? []) {
      const row = step as Record<string, unknown>;
      const sequenceId = text(row.sequence_id);
      const position = Number(row.position);
      if (!sequenceId || !Number.isFinite(position)) continue;
      if (!firstPositionBySequence.has(sequenceId) || position < firstPositionBySequence.get(sequenceId)!) {
        firstPositionBySequence.set(sequenceId, position);
      }
    }

    const { data: existing, error: existingError } = await db
      .from("cadence_tracks")
      .select("id, sequence_id, contact_id, status")
      .in("sequence_id", sequenceIds)
      .in("contact_id", contactIds)
      .in("status", ["active", "paused"]);
    if (existingError) throw existingError;

    const existingKeys = new Set(
      (existing ?? []).map((row: Record<string, unknown>) => `${text(row.sequence_id)}:${text(row.contact_id)}`),
    );

    let suppressedIds = new Set<string>();
    const suppression = await db
      .from("suppression_list")
      .select("contact_id")
      .eq("account_id", actor.accountId)
      .in("contact_id", contactIds);
    if (suppression.error && !tableUnavailable(suppression.error)) throw suppression.error;
    if (!suppression.error) {
      suppressedIds = new Set((suppression.data ?? []).map((row: Record<string, unknown>) => text(row.contact_id)));
    }

    const now = new Date();
    const rows: Record<string, unknown>[] = [];
    const activities: Record<string, unknown>[] = [];
    let skipped = 0;

    for (const sequence of targetSequences) {
      const position = firstPositionBySequence.get(sequence.id);
      if (position === undefined) {
        skipped += contacts.length;
        continue;
      }

      for (const contact of contacts) {
        const key = `${sequence.id}:${contact.contact_id}`;
        if (existingKeys.has(key) || suppressedIds.has(contact.contact_id)) {
          skipped += 1;
          continue;
        }

        const companyId = contact.company_id || text((deal as Record<string, unknown>).company_id);
        if (!companyId) {
          skipped += 1;
          continue;
        }

        rows.push({
          company_id: companyId,
          contact_id: contact.contact_id,
          owner_id: text((deal as Record<string, unknown>).owner_id) || actor.userId,
          sequence_id: sequence.id,
          position,
          persona_type: inferPersona(contact.role || contact.buying_role),
          cadence_day: 1,
          block_number: 1,
          channel: sequence.channel === "email" ? "email" : "whatsapp",
          status: "active",
          scheduled_for: dateKey(now),
          enrolled_at: now.toISOString(),
          paused_until: null,
          completion_reason: null,
        });

        activities.push({
          kind: "enrollment",
          subject: `Entrou na sequência por etapa: ${sequence.name}`,
          body: null,
          direction: null,
          occurred_at: now.toISOString(),
          contact_id: contact.contact_id,
          company_id: companyId,
          deal_id: dealId,
          payload: {
            source: "stage_change",
            account_id: actor.accountId,
            sequence_id: sequence.id,
            sequence_name: sequence.name,
            stage_id: nextStageId,
            stage_name: stageName,
          },
        });
      }
    }

    if (rows.length > 0) {
      const { error: insertError } = await db.from("cadence_tracks").insert(rows);
      if (insertError) throw insertError;

      const { error: activityError } = await db.from("activities").insert(activities);
      if (activityError) console.warn("[handle-stage-change] activity insert failed", activityError.message);
    }

    return json({
      ok: true,
      created: rows.length,
      skipped,
      sequences_checked: targetSequences.length,
      contacts_checked: contacts.length,
      latency_ms: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "UNAUTHORIZED") return json({ error_code: "UNAUTHORIZED" }, 401);
    console.error("[handle-stage-change]", message);
    return json({ error_code: "HANDLE_STAGE_CHANGE_FAILED", message }, 500);
  }
});
