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

const TEMPLATE_ALIASES: Record<string, string> = {
  nome: 'contact.first_name',
  primeiro_nome: 'contact.first_name',
  first_name: 'contact.first_name',
  nome_completo: 'contact.name',
  empresa: 'company.name',
  empreendimento: 'company.custom.nome_empreendimento',
  role: 'contact.role',
  cargo: 'contact.role',
  cidade: 'company.city',
};

const TEMPLATE_VARIABLES = new Set([
  'contact.name',
  'contact.first_name',
  'contact.email',
  'contact.whatsapp',
  'contact.role',
  'company.name',
  'company.domain',
  'company.city',
  'company.industry',
  'company.custom.nome_empreendimento',
  'deal.title',
  'deal.value',
  'owner.name',
]);

const TEMPLATE_PREFIXES = ['contact.', 'company.', 'company.custom.', 'deal.', 'owner.', 'custom.'];
const VARIABLE_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort();
}

function normalizeVariable(variable: string) {
  const trimmed = variable.trim();
  return TEMPLATE_ALIASES[trimmed] ?? trimmed;
}

function firstName(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim().split(/\s+/)[0] ?? '';
}

function readPath(source: unknown, path: string[]) {
  let current = source;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function isAllowedVariable(variable: string) {
  return TEMPLATE_VARIABLES.has(variable) || TEMPLATE_PREFIXES.some((prefix) => variable.startsWith(prefix));
}

function resolveVariable(variable: string, context: Record<string, unknown>) {
  if (variable === 'contact.first_name') return firstName((context.contact as Record<string, unknown> | null)?.name);
  const [scope, ...path] = variable.split('.');
  return readPath(context[scope], path);
}

function renderTemplate(
  template: string,
  context: Record<string, unknown>,
  fallbackStrategy = 'block',
  defaults: Record<string, string> = {},
) {
  const variablesMissing: string[] = [];
  const variablesInvalid: string[] = [];
  const bodyRendered = (template || '').replace(VARIABLE_PATTERN, (match, variable: string) => {
    const normalized = normalizeVariable(variable);
    if (!isAllowedVariable(normalized)) {
      variablesInvalid.push(normalized);
      return match;
    }
    const value = resolveVariable(normalized, context);
    if (value == null || value === '') {
      variablesMissing.push(normalized);
      return defaults[normalized] ?? (fallbackStrategy === 'default' ? '' : match);
    }
    return String(value);
  });
  const variables = uniqueSorted(Array.from((template || '').matchAll(VARIABLE_PATTERN)).map((match) => normalizeVariable(match[1])));
  const invalid = uniqueSorted(variablesInvalid);
  const missing = uniqueSorted(variablesMissing);
  return {
    template,
    body_rendered: bodyRendered,
    variables_used: variables.filter((variable) => !invalid.includes(variable) && !missing.includes(variable)),
    variables_missing: missing,
    variables_invalid: invalid,
    fallback_strategy: fallbackStrategy,
  };
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
          ? supabase.from('companies').select('id, name, domain, city, segment, custom_data').in('id', companyIds)
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
      const renderCompany = company
        ? {
          ...company,
          industry: company.segment,
          custom: company.custom_data ?? {},
        }
        : null;
      const renderContext = { contact, company: renderCompany };
      const fallbackStrategy = (currentStep.config as any).fallback_strategy ?? 'block';
      const rendered = renderTemplate(tpl, renderContext, fallbackStrategy);
      const subjectTemplate = (currentStep.config as any).subject_template ?? `Sequência auto`;
      const renderedSubject = renderTemplate(subjectTemplate, renderContext, fallbackStrategy);
      const renderErrors = [
        ...rendered.variables_invalid,
        ...renderedSubject.variables_invalid,
        ...(fallbackStrategy === 'block' ? rendered.variables_missing : []),
        ...(fallbackStrategy === 'block' ? renderedSubject.variables_missing : []),
      ];
      if (renderErrors.length > 0) {
        await supabase.from('sequence_step_runs').insert({
          enrollment_id: enrollment.id,
          step_id: currentStep.id,
          status: 'failed',
          error_msg: `Template variavel ausente/invalida: ${renderErrors[0]}`,
        });
        processed++;
        continue;
      }

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
          : renderedSubject.body_rendered,
        body: rendered.body_rendered,
        direction: isManualTask ? null : 'out',
        occurred_at: now.toISOString(),
        contact_id: contact.id,
        company_id: company?.id ?? null,
        payload: {
          sequence_id: seq?.id,
          step_id: currentStep.id,
          step_type: currentStep.step_type,
          template: rendered.template,
          body_rendered: rendered.body_rendered,
          variables_used: rendered.variables_used,
          variables_missing: rendered.variables_missing,
          variables_invalid: rendered.variables_invalid,
          fallback_strategy: rendered.fallback_strategy,
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
