import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { addDays, isWorkingDay, parseDateKey, toDateKey } from "../../../src/lib/brCalendar.ts";
import { PIPA_21_DAY_CADENCE, personalizeTemplate, type PersonaType } from "../../../src/lib/pipaGtm.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

type TrackStatus = "active" | "paused" | "completed" | "meeting_booked" | "proposal_sent" | "errored";

interface CadenceTrackRow {
  id: string;
  company_id: string;
  contact_id: string | null;
  owner_id: string | null;
  persona_type: PersonaType;
  cadence_day: number | null;
  block_number: number | null;
  status: TrackStatus;
  enrolled_at: string | null;
  company?: { id: string; name: string; owner_id: string | null } | null;
  contact?: { id: string; name: string; role: string | null; email: string | null; whatsapp: string | null } | null;
}

interface DailyTaskRow {
  id: string;
  task_type: string;
  cadence_day: number | null;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function getSaoPauloParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const byType = new Map(parts.map((part) => [part.type, part.value]));
  const year = Number(byType.get("year"));
  const month = Number(byType.get("month"));
  const day = Number(byType.get("day"));
  const hour = Number(byType.get("hour"));
  const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return { dateKey, hour, date: parseDateKey(dateKey) };
}

function isBusinessWindow(force: boolean) {
  if (force) return true;
  const saoPaulo = getSaoPauloParts();
  return isWorkingDay(saoPaulo.date) && saoPaulo.hour >= 8 && saoPaulo.hour < 18;
}

function cadenceDayFromEnrollment(enrolledAt: string | null, todayKey: string) {
  if (!enrolledAt) return 1;
  const enrolled = new Date(enrolledAt);
  if (Number.isNaN(enrolled.getTime())) return 1;

  let cursor = parseDateKey(toDateKey(enrolled));
  while (!isWorkingDay(cursor)) cursor = addDays(cursor, 1);

  const today = parseDateKey(todayKey);
  let count = 0;
  for (; cursor <= today; cursor = addDays(cursor, 1)) {
    if (isWorkingDay(cursor)) count += 1;
  }

  return Math.max(1, Math.min(count || 1, 22));
}

function blockForDay(cadenceDay: number) {
  const step = [...PIPA_21_DAY_CADENCE]
    .filter((item) => item.day <= cadenceDay)
    .sort((a, b) => b.day - a.day)[0];
  return step?.block ?? 1;
}

function isTerminalCadenceDay(cadenceDay: number) {
  return cadenceDay > 21;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const force = Boolean(body?.force || url.searchParams.get("force") === "1");
    const dryRun = Boolean(body?.dry_run || url.searchParams.get("dry_run") === "1");
    const saoPaulo = getSaoPauloParts();

    if (!isBusinessWindow(force)) {
      return jsonResponse({
        ok: true,
        skipped: true,
        reason: "outside_business_window",
        today: saoPaulo.dateKey,
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: tracks, error: tracksError } = await supabase
      .from("cadence_tracks")
      .select(`
        id, company_id, contact_id, owner_id, persona_type, cadence_day, block_number, status, enrolled_at,
        company:companies(id, name, owner_id),
        contact:contacts(id, name, role, email, whatsapp)
      `)
      .eq("status", "active");
    if (tracksError) throw tracksError;

    const result = {
      ok: true,
      dry_run: dryRun,
      today: saoPaulo.dateKey,
      processed_tracks: 0,
      completed_tracks: 0,
      generated_tasks: 0,
      skipped_duplicates: 0,
      activities_created: 0,
      errors: [] as Array<{ track_id: string; error: string }>,
    };

    for (const track of (tracks ?? []) as CadenceTrackRow[]) {
      try {
        result.processed_tracks += 1;
        const cadenceDay = cadenceDayFromEnrollment(track.enrolled_at, saoPaulo.dateKey);
        const blockNumber = blockForDay(cadenceDay);

        if (isTerminalCadenceDay(cadenceDay)) {
          result.completed_tracks += 1;
          if (!dryRun) {
            await supabase
              .from("cadence_tracks")
              .update({ status: "completed", cadence_day: 21, completed_at: new Date().toISOString() })
              .eq("id", track.id);
          }
          continue;
        }

        if (!dryRun) {
          await supabase
            .from("cadence_tracks")
            .update({ cadence_day: cadenceDay, block_number: blockNumber })
            .eq("id", track.id);
        }

        const steps = PIPA_21_DAY_CADENCE.filter(
          (step) => step.day === cadenceDay && step.personas.includes(track.persona_type),
        );
        if (steps.length === 0) continue;

        const { data: existingTasks, error: existingError } = await supabase
          .from("daily_tasks")
          .select("id, task_type, cadence_day")
          .eq("cadence_track_id", track.id)
          .eq("cadence_day", cadenceDay);
        if (existingError) throw existingError;

        const existingTypes = new Set(
          ((existingTasks ?? []) as DailyTaskRow[]).map((task) => `${task.cadence_day}:${task.task_type}`),
        );

        const rows = steps
          .filter((step) => !existingTypes.has(`${step.day}:${step.taskType}`))
          .map((step) => ({
            company_id: track.company_id,
            contact_id: track.contact_id,
            cadence_track_id: track.id,
            task_type: step.taskType,
            persona_type: track.persona_type,
            cadence_day: step.day,
            block_number: step.block,
            generated_message: personalizeTemplate(step.message, {
              name: track.contact?.name ?? "time",
              company: track.company?.name ?? "sua empresa",
            }),
            urgency: step.day === 1 ? "today" : "normal",
            due_date: saoPaulo.dateKey,
            status: "pending",
          }));

        result.skipped_duplicates += steps.length - rows.length;
        if (rows.length === 0 || dryRun) {
          result.generated_tasks += rows.length;
          continue;
        }

        const { data: insertedTasks, error: insertError } = await supabase
          .from("daily_tasks")
          .insert(rows)
          .select("id, task_type, cadence_day");
        if (insertError) throw insertError;

        result.generated_tasks += insertedTasks?.length ?? 0;

        for (const task of (insertedTasks ?? []) as DailyTaskRow[]) {
          const { error: activityError } = await supabase.from("activities").insert({
            kind: "sequence_step",
            subject: `Cadencia dia ${task.cadence_day}: ${task.task_type}`,
            body: null,
            direction: "out",
            occurred_at: new Date().toISOString(),
            created_by: track.owner_id ?? track.company?.owner_id ?? null,
            contact_id: track.contact_id,
            company_id: track.company_id,
            deal_id: null,
            payload: {
              source: "sequence_worker",
              cadence_track_id: track.id,
              daily_task_id: task.id,
              cadence_day: task.cadence_day,
              task_type: task.task_type,
            },
          });
          if (!activityError) result.activities_created += 1;
        }
      } catch (error) {
        result.errors.push({
          track_id: track.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return jsonResponse(result, result.errors.length ? 207 : 200);
  } catch (error) {
    return jsonResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
