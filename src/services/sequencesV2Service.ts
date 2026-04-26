import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type StepType =
  | 'email_manual'
  | 'email_auto'
  | 'call_task'
  | 'linkedin_task'
  | 'whatsapp_task'
  | 'wait'
  | 'condition';

export interface StepV2 {
  id: string;
  sequence_id: string;
  position: number;
  step_type: StepType;
  config: Record<string, unknown>;
  created_at: string;
}

export interface StepRun {
  id: string;
  enrollment_id: string;
  step_id: string;
  run_at: string;
  status: 'queued' | 'sent' | 'skipped' | 'failed';
  channel: string | null;
  message_id: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  replied_at: string | null;
  error_msg: string | null;
}

export interface StepStats {
  stepId: string;
  stepType: StepType;
  position: number;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  failed: number;
  skipped: number;
}

export interface SequenceV2Config {
  stop_on_reply?: boolean;
  max_enrollments_per_day?: number;
}

// ---------------------------------------------------------------------------
// Node/Edge types for ReactFlow
// ---------------------------------------------------------------------------
export interface FlowNodeData {
  stepType: StepType;
  position: number;
  config: Record<string, unknown>;
  label: string;
}

// ---------------------------------------------------------------------------
// CRUD Steps V2
// ---------------------------------------------------------------------------

export async function getStepsV2(sequenceId: string): Promise<StepV2[]> {
  const { data, error } = await supabase
    .from('sequence_steps_v2')
    .select('*')
    .eq('sequence_id', sequenceId)
    .order('position');
  if (error) throw error;
  return data ?? [];
}

export async function upsertStepsV2(
  sequenceId: string,
  steps: Omit<StepV2, 'created_at'>[],
): Promise<void> {
  // Delete removed steps
  const { data: existing } = await supabase
    .from('sequence_steps_v2')
    .select('id')
    .eq('sequence_id', sequenceId);

  const existingIds = new Set((existing ?? []).map((s) => s.id));
  const incomingIds = new Set(steps.filter((s) => !s.id.startsWith('new-')).map((s) => s.id));

  // Delete steps that are no longer present
  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
  if (toDelete.length > 0) {
    await supabase.from('sequence_steps_v2').delete().in('id', toDelete);
  }

  // Upsert remaining
  for (const step of steps) {
    const isNew = step.id.startsWith('new-');
    if (isNew) {
      await supabase.from('sequence_steps_v2').insert({
        sequence_id: sequenceId,
        position: step.position,
        step_type: step.step_type,
        config: step.config,
      });
    } else {
      await supabase
        .from('sequence_steps_v2')
        .update({
          position: step.position,
          step_type: step.step_type,
          config: step.config,
        })
        .eq('id', step.id);
    }
  }
}

// ---------------------------------------------------------------------------
// Step Runs + Stats
// ---------------------------------------------------------------------------

export async function getStepRuns(enrollmentId: string): Promise<StepRun[]> {
  const { data, error } = await supabase
    .from('sequence_step_runs')
    .select('*')
    .eq('enrollment_id', enrollmentId)
    .order('run_at');
  if (error) throw error;
  return data ?? [];
}

export async function getSequenceStats(sequenceId: string): Promise<StepStats[]> {
  // Get all steps
  const steps = await getStepsV2(sequenceId);
  if (steps.length === 0) return [];

  const stepIds = steps.map((s) => s.id);

  // Get all runs for these steps
  const { data: runs, error } = await supabase
    .from('sequence_step_runs')
    .select('*')
    .in('step_id', stepIds);
  if (error) throw error;

  // Aggregate
  const statsMap: Record<string, StepStats> = {};
  steps.forEach((s) => {
    statsMap[s.id] = {
      stepId: s.id,
      stepType: s.step_type as StepType,
      position: s.position,
      sent: 0,
      opened: 0,
      clicked: 0,
      replied: 0,
      failed: 0,
      skipped: 0,
    };
  });

  (runs ?? []).forEach((r) => {
    const st = statsMap[r.step_id];
    if (!st) return;
    if (r.status === 'sent') st.sent++;
    if (r.status === 'failed') st.failed++;
    if (r.status === 'skipped') st.skipped++;
    if (r.opened_at) st.opened++;
    if (r.clicked_at) st.clicked++;
    if (r.replied_at) st.replied++;
  });

  return steps.map((s) => statsMap[s.id]);
}

// ---------------------------------------------------------------------------
// Sequence config helpers
// ---------------------------------------------------------------------------

export async function updateSequenceV2Config(
  sequenceId: string,
  config: SequenceV2Config,
): Promise<void> {
  const { error } = await supabase
    .from('sequences')
    .update(config)
    .eq('id', sequenceId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Upsert sequence (V2 simplified — no funnel/stage required)
// ---------------------------------------------------------------------------

export interface SequenceHeader {
  id: string;
  name: string;
  channel?: string;
  active?: boolean;
}

export async function upsertSequenceV2(params: {
  id?: string;
  name: string;
  channel?: 'whatsapp' | 'email' | 'both';
}): Promise<SequenceHeader> {
  const payload: Record<string, unknown> = {
    name: params.name,
    active: true,
  };
  if (params.channel) payload.channel = params.channel;
  if (params.id) payload.id = params.id;

  const { data, error } = await supabase
    .from('sequences')
    .upsert(payload)
    .select('id, name, channel, active')
    .single();
  if (error) throw error;
  return data as SequenceHeader;
}

// ---------------------------------------------------------------------------
// Step type labels & icons
// ---------------------------------------------------------------------------

export const STEP_TYPE_LABELS: Record<StepType, string> = {
  email_manual: 'Email (manual)',
  email_auto: 'Email (auto)',
  call_task: 'Ligação',
  linkedin_task: 'LinkedIn',
  whatsapp_task: 'WhatsApp',
  wait: 'Aguardar',
  condition: 'Condição',
};

export const STEP_TYPE_COLORS: Record<StepType, string> = {
  email_manual: '#f59e0b',
  email_auto: '#f97316',
  call_task: '#10b981',
  linkedin_task: '#3b82f6',
  whatsapp_task: '#22c55e',
  wait: '#6b7280',
  condition: '#8b5cf6',
};
