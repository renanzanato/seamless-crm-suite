import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isBusinessHour(): boolean {
  // Get current BRT time (UTC-3)
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 3600000);
  const day = brt.getUTCDay(); // 0=Sun
  const hour = brt.getUTCHours();
  return day >= 1 && day <= 5 && hour >= 9 && hour < 18;
}

function renderTemplate(
  template: string,
  contact: Record<string, unknown>,
  company: Record<string, unknown> | null,
): string {
  if (!template) return '';
  return template
    .replace(/\{\{nome\}\}/g, String((contact.name as string)?.split(' ')[0] ?? ''))
    .replace(/\{\{primeiro_nome\}\}/g, String((contact.name as string)?.split(' ')[0] ?? ''))
    .replace(/\{\{nome_completo\}\}/g, String(contact.name ?? ''))
    .replace(/\{\{empresa\}\}/g, String(company?.name ?? ''))
    .replace(/\{\{role\}\}/g, String(contact.role ?? ''));
}

// ---------------------------------------------------------------------------
// Main Worker
// ---------------------------------------------------------------------------

serve(async (req) => {
  try {
    // Use service-role key so we bypass RLS for the worker
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );

    // ── 1. Fetch active enrollments ──────────────────────────
    const { data: enrollments, error: enrollErr } = await supabase
      .from('cadence_tracks')
      .select(`
        id, contact_id, sequence_id, position, status,
        contact:contacts(id, name, email, whatsapp, role, company_id)
      `)
      .eq('status', 'active');

    if (enrollErr) throw enrollErr;
    if (!enrollments || enrollments.length === 0) {
      return new Response(JSON.stringify({ processed: 0, msg: 'No active enrollments' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Batch-fetch sequences, steps, companies ───────────
    const sequenceIds = [...new Set(enrollments.map((e: any) => e.sequence_id))];
    const companyIds = [
      ...new Set(
        enrollments
          .map((e: any) => (e.contact as any)?.company_id)
          .filter(Boolean),
      ),
    ];

    const [{ data: sequences }, { data: steps }, { data: companies }] =
      await Promise.all([
        supabase.from('sequences').select('*').in('id', sequenceIds),
        supabase
          .from('sequence_steps_v2')
          .select('*')
          .in('sequence_id', sequenceIds)
          .order('position'),
        companyIds.length > 0
          ? supabase.from('companies').select('id, name').in('id', companyIds)
          : { data: [] },
      ]);

    // Index helpers
    const stepsBySeq: Record<string, any[]> = {};
    (steps ?? []).forEach((s: any) => {
      (stepsBySeq[s.sequence_id] ??= []).push(s);
    });
    const seqById = Object.fromEntries(
      (sequences ?? []).map((s: any) => [s.id, s]),
    );
    const companyById = Object.fromEntries(
      (companies ?? []).map((c: any) => [c.id, c]),
    );

    let processed = 0;
    const now = new Date();

    // ── 3. Process each enrollment ───────────────────────────
    for (const enrollment of enrollments as any[]) {
      const seqSteps = stepsBySeq[enrollment.sequence_id] ?? [];
      if (seqSteps.length === 0) continue;

      const currentStep = seqSteps.find(
        (s: any) => s.position === enrollment.position,
      );

      // No more steps → mark completed
      if (!currentStep) {
        await supabase
          .from('cadence_tracks')
          .update({ status: 'completed' })
          .eq('id', enrollment.id);
        processed++;
        continue;
      }

      // ── Idempotency: check if this step already ran ────────
      const { data: existingRuns } = await supabase
        .from('sequence_step_runs')
        .select('id, status, run_at')
        .eq('enrollment_id', enrollment.id)
        .eq('step_id', currentStep.id)
        .order('run_at', { ascending: false })
        .limit(1);

      const lastRun = existingRuns?.[0];
      const seq = seqById[enrollment.sequence_id];
      const contact = enrollment.contact as any;
      const company = contact?.company_id
        ? companyById[contact.company_id]
        : null;

      // ── Check stop_on_reply ────────────────────────────────
      if (seq?.stop_on_reply) {
        const { data: replyCheck } = await supabase
          .from('activities')
          .select('id')
          .eq('direction', 'in')
          .eq('contact_id', contact.id)
          .gte('occurred_at', enrollment.last_step_at ?? enrollment.created_at)
          .limit(1);
        if (replyCheck && replyCheck.length > 0) {
          await supabase
            .from('cadence_tracks')
            .update({ status: 'unenrolled' })
            .eq('id', enrollment.id);
          processed++;
          continue;
        }
      }

      // ── WAIT step ──────────────────────────────────────────
      if (currentStep.step_type === 'wait') {
        const days = (currentStep.config as any).days ?? 1;
        const bizOnly = (currentStep.config as any).business_hours_only ?? true;

        if (!lastRun) {
          // First encounter — plant a marker
          await supabase.from('sequence_step_runs').insert({
            enrollment_id: enrollment.id,
            step_id: currentStep.id,
            status: 'queued',
          });
          continue; // wait starts NOW
        }

        // Check if enough time elapsed since marker
        const elapsed =
          (now.getTime() - new Date(lastRun.run_at).getTime()) /
          (1000 * 3600 * 24);
        if (elapsed < days) continue; // still waiting
        if (bizOnly && !isBusinessHour()) continue; // wait for biz hours

        // Wait done — advance
        await supabase
          .from('sequence_step_runs')
          .update({ status: 'skipped' })
          .eq('id', lastRun.id);
        await supabase
          .from('cadence_tracks')
          .update({
            position: currentStep.position + 1,
            last_step_at: now.toISOString(),
          })
          .eq('id', enrollment.id);
        processed++;
        continue;
      }

      // ── CONDITION step ─────────────────────────────────────
      if (currentStep.step_type === 'condition') {
        const check = (currentStep.config as any).check ?? 'replied';
        let met = false;

        if (check === 'replied') {
          const { data: replies } = await supabase
            .from('activities')
            .select('id')
            .eq('direction', 'in')
            .eq('contact_id', contact.id)
            .limit(1);
          met = !!(replies && replies.length > 0);
        } else if (check === 'opened') {
          // Check step_runs for opened_at on previous steps
          const { data: opens } = await supabase
            .from('sequence_step_runs')
            .select('id')
            .eq('enrollment_id', enrollment.id)
            .not('opened_at', 'is', null)
            .limit(1);
          met = !!(opens && opens.length > 0);
        }

        // True → next position; False → skip one (position + 2)
        const truePos =
          (currentStep.config as any).if_true_step_position ??
          currentStep.position + 1;
        const falsePos =
          (currentStep.config as any).if_false_step_position ??
          currentStep.position + 2;

        await supabase.from('sequence_step_runs').insert({
          enrollment_id: enrollment.id,
          step_id: currentStep.id,
          status: 'skipped',
        });
        await supabase
          .from('cadence_tracks')
          .update({
            position: met ? truePos : falsePos,
            last_step_at: now.toISOString(),
          })
          .eq('id', enrollment.id);
        processed++;
        continue;
      }

      // ── ACTION steps (email/whatsapp/call/linkedin) ────────
      if (lastRun && lastRun.status === 'sent') continue; // already ran

      // Business hours check
      if (!isBusinessHour()) continue;

      const tpl =
        (currentStep.config as any).body_template ??
        (currentStep.config as any).prompt ??
        '';
      const rendered = renderTemplate(tpl, contact, company);

      // Map step_type → activity kind
      const kindMap: Record<string, string> = {
        email_auto: 'email',
        email_manual: 'email',
        whatsapp_task: 'whatsapp',
        call_task: 'call',
        linkedin_task: 'task',
      };
      const actKind = kindMap[currentStep.step_type] ?? 'task';
      const isManualTask = ['call_task', 'linkedin_task', 'email_manual'].includes(
        currentStep.step_type,
      );

      // Create activity
      const actPayload: Record<string, unknown> = {
        kind: isManualTask ? 'task' : actKind,
        subject: isManualTask
          ? `[Sequência] ${currentStep.step_type.replace('_', ' ')}`
          : (currentStep.config as any).subject_template ?? `Sequência auto`,
        body: rendered,
        direction: isManualTask ? null : 'out',
        occurred_at: now.toISOString(),
        contact_id: contact.id,
        company_id: company?.id ?? null,
        payload: {
          sequence_id: seq?.id,
          step_id: currentStep.id,
          step_type: currentStep.step_type,
          is_automated: !isManualTask,
          ...(isManualTask ? { status: 'pending', due_date: now.toISOString().slice(0, 10) } : {}),
        },
      };
      await supabase.from('activities').insert(actPayload);

      // Log run
      await supabase.from('sequence_step_runs').insert({
        enrollment_id: enrollment.id,
        step_id: currentStep.id,
        status: 'sent',
        channel: currentStep.step_type.includes('email')
          ? 'email'
          : currentStep.step_type.includes('whatsapp')
            ? 'whatsapp'
            : null,
      });

      // Advance position
      await supabase
        .from('cadence_tracks')
        .update({
          position: currentStep.position + 1,
          last_step_at: now.toISOString(),
        })
        .eq('id', enrollment.id);

      processed++;
    }

    return new Response(
      JSON.stringify({ processed, total: enrollments.length }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
