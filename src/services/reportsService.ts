import { supabase } from '@/lib/supabase';
import { DEAL_STAGES } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface FunnelData {
  stage: string;
  count: number;
  value: number;
}

export interface VelocityData {
  stage: string;
  avgDays: number;
  totalMoves: number;
}

export interface OwnerPerformance {
  ownerId: string;
  ownerName: string;
  dealsWon: number;
  totalValue: number;
  dealsLost: number;
}

export interface WeeklyActivity {
  week: string;       // "2026-W17"
  weekLabel: string;  // "21/04"
  note: number;
  call: number;
  email: number;
  whatsapp: number;
  task: number;
  meeting: number;
}

interface DealReportRow {
  stage?: string | null;
  stage_ref?: { name: string | null } | null;
  value: number | null;
  owner_id?: string | null;
  owner?: { id: string; name: string | null } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function getWeekKey(date: Date): string {
  const year = date.getFullYear();
  const oneJan = new Date(year, 0, 1);
  const days = Math.floor((date.getTime() - oneJan.getTime()) / 86400000);
  const week = Math.ceil((days + oneJan.getDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function getWeekLabel(date: Date): string {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function reportStage(row: DealReportRow) {
  return row.stage || row.stage_ref?.name || 'Qualificação';
}

async function getDealRowsForReports(params: {
  periodDays?: number;
  ownerId?: string;
  includeOwner?: boolean;
} = {}): Promise<DealReportRow[]> {
  const applyFilters = (query: ReturnType<typeof supabase.from>) => {
    let next = query;
    if (params.periodDays && params.periodDays > 0) next = next.gte('created_at', daysAgo(params.periodDays));
    if (params.ownerId && params.ownerId !== '__all__') next = next.eq('owner_id', params.ownerId);
    return next;
  };

  const ownerSelect = params.includeOwner ? ', owner_id, owner:profiles!deals_owner_id_fkey(id, name)' : '';
  const textStage = await applyFilters(
    supabase.from('deals').select(`stage, value${ownerSelect}`),
  );

  if (!textStage.error) return (textStage.data ?? []) as DealReportRow[];

  console.warn('[reportsService] deals.stage unavailable, falling back to stage_id:', textStage.error.message);
  const stageId = await applyFilters(
    supabase.from('deals').select(`value, stage_ref:stages(name)${ownerSelect}`),
  );

  if (stageId.error) {
    console.warn('[reportsService] deals report unavailable:', stageId.error.message);
    return [];
  }

  return (stageId.data ?? []) as DealReportRow[];
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** 1. Funil de conversao: deals por stage */
export async function getFunnelData(
  periodDays: number,
  ownerId?: string,
): Promise<FunnelData[]> {
  const data = await getDealRowsForReports({ periodDays, ownerId });

  const byStage: Record<string, { count: number; value: number }> = {};
  DEAL_STAGES.forEach((s) => { byStage[s] = { count: 0, value: 0 }; });

  data.forEach((d) => {
    const s = reportStage(d);
    if (!byStage[s]) byStage[s] = { count: 0, value: 0 };
    byStage[s].count++;
    byStage[s].value += d.value ?? 0;
  });

  return DEAL_STAGES.map((stage) => ({
    stage,
    count: byStage[stage]?.count ?? 0,
    value: byStage[stage]?.value ?? 0,
  }));
}

/** 2. Deal velocity: tempo medio por stage */
export async function getVelocityData(): Promise<VelocityData[]> {
  // Try deal_history first
  const { data: history, error: histErr } = await supabase
    .from('deal_history')
    .select('from_stage, to_stage, moved_at, deal_id');

  if (!histErr && history && history.length > 0) {
    // Group by from_stage, compute avg time
    const stageMovements: Record<string, number[]> = {};

    // Sort by deal_id + moved_at to compute time between consecutive moves
    const sorted = [...history].sort((a, b) => {
      if (a.deal_id !== b.deal_id) return a.deal_id.localeCompare(b.deal_id);
      return new Date(a.moved_at).getTime() - new Date(b.moved_at).getTime();
    });

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].deal_id === sorted[i - 1].deal_id) {
        const from = sorted[i - 1].to_stage;
        const days = Math.max(
          0,
          (new Date(sorted[i].moved_at).getTime() - new Date(sorted[i - 1].moved_at).getTime()) /
            86400000,
        );
        if (!stageMovements[from]) stageMovements[from] = [];
        stageMovements[from].push(days);
      }
    }

    return DEAL_STAGES.filter((s) => !s.startsWith('Fechado')).map((stage) => {
      const times = stageMovements[stage] ?? [];
      const avg = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
      return { stage, avgDays: Math.round(avg * 10) / 10, totalMoves: times.length };
    });
  }

  // Fallback: use activities kind='stage_change'
  const { data: activities, error: actErr } = await supabase
    .from('activities')
    .select('payload, occurred_at, deal_id')
    .eq('kind', 'stage_change')
    .order('occurred_at');

  if (actErr) throw actErr;

  const stageMovements: Record<string, number[]> = {};
  const dealLastMove: Record<string, { stage: string; time: number }> = {};

  (activities ?? []).forEach((a) => {
    const p = a.payload as Record<string, unknown> | null;
    const fromStage = (p?.from_stage ?? p?.fromStage) as string | undefined;
    const toStage = (p?.to_stage ?? p?.toStage) as string | undefined;
    if (!fromStage || !toStage || !a.deal_id) return;

    const time = new Date(a.occurred_at).getTime();
    const last = dealLastMove[a.deal_id];
    if (last && last.stage === fromStage) {
      const days = (time - last.time) / 86400000;
      if (!stageMovements[fromStage]) stageMovements[fromStage] = [];
      stageMovements[fromStage].push(days);
    }
    dealLastMove[a.deal_id] = { stage: toStage, time };
  });

  return DEAL_STAGES.filter((s) => !s.startsWith('Fechado')).map((stage) => {
    const times = stageMovements[stage] ?? [];
    const avg = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    return { stage, avgDays: Math.round(avg * 10) / 10, totalMoves: times.length };
  });
}

/** 3. Performance por owner */
export async function getOwnerPerformance(periodDays: number): Promise<OwnerPerformance[]> {
  const data = await getDealRowsForReports({ periodDays, includeOwner: true });

  const byOwner: Record<string, OwnerPerformance> = {};

  data.forEach((d) => {
    const ownerId = d.owner_id;
    const ownerObj = d.owner as { id: string; name: string } | null;
    if (!ownerId) return;
    if (!byOwner[ownerId]) {
      byOwner[ownerId] = {
        ownerId,
        ownerName: ownerObj?.name ?? ownerId.slice(0, 8),
        dealsWon: 0,
        totalValue: 0,
        dealsLost: 0,
      };
    }
    const stage = reportStage(d);
    if (stage === 'Fechado - Ganho') {
      byOwner[ownerId].dealsWon++;
      byOwner[ownerId].totalValue += d.value ?? 0;
    } else if (stage === 'Fechado - Perdido') {
      byOwner[ownerId].dealsLost++;
    }
  });

  return Object.values(byOwner).sort((a, b) => b.totalValue - a.totalValue);
}

/** 4. Atividade semanal da equipe (ultimas 12 semanas) */
export async function getWeeklyActivity(): Promise<WeeklyActivity[]> {
  const since = daysAgo(84); // 12 weeks
  const { data, error } = await supabase
    .from('activities')
    .select('kind, occurred_at')
    .gte('occurred_at', since);
  if (error) throw error;

  // Generate 12 week buckets
  const weeks: Map<string, WeeklyActivity> = new Map();
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    const monday = getMonday(d);
    const key = getWeekKey(monday);
    if (!weeks.has(key)) {
      weeks.set(key, {
        week: key,
        weekLabel: getWeekLabel(monday),
        note: 0,
        call: 0,
        email: 0,
        whatsapp: 0,
        task: 0,
        meeting: 0,
      });
    }
  }

  const TRACKED_KINDS = ['note', 'call', 'email', 'whatsapp', 'task', 'meeting'] as const;

  (data ?? []).forEach((a) => {
    const d = new Date(a.occurred_at);
    const monday = getMonday(d);
    const key = getWeekKey(monday);
    const w = weeks.get(key);
    if (!w) return;
    const kind = a.kind as string;
    if (TRACKED_KINDS.includes(kind as (typeof TRACKED_KINDS)[number])) {
      w[kind as keyof Pick<WeeklyActivity, 'note' | 'call' | 'email' | 'whatsapp' | 'task' | 'meeting'>]++;
    }
  });

  return Array.from(weeks.values());
}
