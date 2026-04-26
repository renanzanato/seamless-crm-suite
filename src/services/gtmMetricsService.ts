import { supabase } from "@/lib/supabase";
import { getMonthWorkingDays, getRemainingWorkingDaysInMonth, isWorkingDay } from "@/lib/brCalendar";
import { PIPA_GTM_CONTEXT } from "@/lib/pipaGtm";

export interface MetricCard {
  label: string;
  value: string;
  detail: string;
  health: "good" | "attention" | "risk" | "neutral";
}

export interface GoalProgress {
  key: string;
  label: string;
  target: number;
  actual: number;
  unit: "count" | "currency";
  achievementPct: number;
  expectedPct: number;
  expectedActual: number;
  remaining: number;
  forcedPerWorkingDay: number;
  targetLabel: string;
  actualLabel: string;
  expectedLabel: string;
  remainingLabel: string;
  forcedLabel: string;
  detail: string;
  health: MetricCard["health"];
}

export interface ExecutiveStat {
  label: string;
  value: string;
  detail: string;
  tone: "primary" | "good" | "attention" | "neutral";
}

export interface PipelineStageMetric {
  label: string;
  count: number;
  value: number;
}

export interface GtmMetrics {
  generatedAt: string;
  calendar: {
    remainingWorkingDays: number;
    totalWorkingDays: number;
    elapsedWorkingDays: number;
    requiredPhase0PerWorkingDay: number;
    requiredMeetingsPerWorkingDay: number;
  };
  goals: GoalProgress[];
  executive: ExecutiveStat[];
  pipeline: PipelineStageMetric[];
  presales: MetricCard[];
  sales: MetricCard[];
  expansion: MetricCard[];
  efficiency: MetricCard[];
}

interface CompanyRow {
  id: string;
  status: string | null;
  buying_signal: string | null;
  cadence_status: string | null;
  last_interaction_at: string | null;
  vgv_projected: number | null;
  monthly_media_spend: number | null;
}

interface DealRow {
  stage: string | null;
  stage_id?: string | null;
  stage_ref?: { name: string | null } | null;
  value: number | null;
  created_at: string | null;
}

interface InteractionRow {
  company_id: string | null;
  interaction_type: string;
}

interface ActivityMetricRow {
  company_id: string | null;
  kind: string | null;
  payload: Record<string, unknown> | null;
}

interface Phase0Row {
  company_id: string;
}

interface LaunchRow {
  status: string | null;
}

function brl(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function compactNumber(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function formatGoalValue(value: number, unit: GoalProgress["unit"]) {
  return unit === "currency" ? brl(value) : compactNumber(value);
}

function percent(value: number) {
  return `${Math.round(value)}%`;
}

function sumValues<T>(rows: T[], getter: (row: T) => number | null | undefined) {
  return rows.reduce((sum, row) => sum + Number(getter(row) ?? 0), 0);
}

async function countRows(table: string, build?: (query: ReturnType<typeof supabase.from>) => unknown) {
  try {
    const base = supabase.from(table);
    const query = build ? build(base) : base.select("id", { count: "exact", head: true });
    const result = await (query as PromiseLike<{ count: number | null; error: { message: string } | null }>);
    if (result.error) return 0;
    return result.count ?? 0;
  } catch {
    return 0;
  }
}

function normalizeDealStage(row: DealRow) {
  return row.stage || row.stage_ref?.name || "Qualificação";
}

async function getDealsForMetrics(): Promise<DealRow[]> {
  const textStage = await supabase
    .from("deals")
    .select("stage, value, created_at");

  if (!textStage.error) return (textStage.data ?? []) as DealRow[];

  console.warn("[gtmMetricsService] deals.stage unavailable, falling back to stage_id:", textStage.error.message);
  const stageId = await supabase
    .from("deals")
    .select("stage_id, value, created_at, stage_ref:stages(name)");

  if (stageId.error) {
    console.warn("[gtmMetricsService] deals metrics unavailable:", stageId.error.message);
    return [];
  }

  return ((stageId.data ?? []) as DealRow[]).map((row) => ({
    ...row,
    stage: normalizeDealStage(row),
  }));
}

function activityKindToInteractionType(kind: string | null, payload: Record<string, unknown> | null) {
  if (typeof payload?.interaction_type === "string") return payload.interaction_type;
  if (kind === "meeting") return "meeting";
  if (kind === "stage_change" && payload?.to_stage === "Proposta") return "proposal_sent";
  if (kind === "sequence_step") return "cadence_step";
  return kind ?? "activity";
}

async function getInteractionRowsForMetrics(monthStartIso: string, nextMonthStartIso: string): Promise<InteractionRow[]> {
  const activities = await supabase
    .from("activities")
    .select("company_id, kind, payload")
    .gte("occurred_at", monthStartIso)
    .lt("occurred_at", nextMonthStartIso);

  if (!activities.error) {
    return ((activities.data ?? []) as ActivityMetricRow[]).map((row) => ({
      company_id: row.company_id,
      interaction_type: activityKindToInteractionType(row.kind, row.payload),
    }));
  }

  console.warn("[gtmMetricsService] activities unavailable, falling back to interactions:", activities.error.message);
  const interactions = await supabase
    .from("interactions")
    .select("company_id, interaction_type")
    .gte("created_at", monthStartIso)
    .lt("created_at", nextMonthStartIso);

  if (interactions.error) {
    console.warn("[gtmMetricsService] interactions metrics unavailable:", interactions.error.message);
    return [];
  }

  return (interactions.data ?? []) as InteractionRow[];
}

function getGoalHealth(actual: number, expectedActual: number, target: number): MetricCard["health"] {
  if (target <= 0) return "neutral";
  if (actual >= target) return "good";
  if (expectedActual <= 0) return actual > 0 ? "good" : "neutral";
  if (actual >= expectedActual) return "good";
  if (actual >= expectedActual * 0.7) return "attention";
  return "risk";
}

function buildGoalProgress(params: {
  key: string;
  label: string;
  target: number;
  actual: number;
  unit: GoalProgress["unit"];
  remainingWorkingDays: number;
  elapsedWorkingDays: number;
  totalWorkingDays: number;
  detail: string;
}): GoalProgress {
  const expectedActual = params.totalWorkingDays > 0
    ? (params.target * params.elapsedWorkingDays) / params.totalWorkingDays
    : 0;
  const achievementPct = params.target > 0 ? (params.actual / params.target) * 100 : 0;
  const expectedPct = params.target > 0 ? (expectedActual / params.target) * 100 : 0;
  const remaining = Math.max(params.target - params.actual, 0);
  const forcedPerWorkingDay = params.remainingWorkingDays > 0
    ? remaining / params.remainingWorkingDays
    : remaining;
  const health = getGoalHealth(params.actual, expectedActual, params.target);

  return {
    key: params.key,
    label: params.label,
    target: params.target,
    actual: params.actual,
    unit: params.unit,
    achievementPct,
    expectedPct,
    expectedActual,
    remaining,
    forcedPerWorkingDay,
    targetLabel: formatGoalValue(params.target, params.unit),
    actualLabel: formatGoalValue(params.actual, params.unit),
    expectedLabel: formatGoalValue(expectedActual, params.unit),
    remainingLabel: formatGoalValue(remaining, params.unit),
    forcedLabel:
      remaining <= 0
        ? "Meta batida"
        : params.unit === "currency"
          ? `${brl(forcedPerWorkingDay)}/dia`
          : `${forcedPerWorkingDay.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}/dia`,
    detail: params.detail,
    health,
  };
}

export async function getGtmMetrics(): Promise<GtmMetrics> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthStartIso = monthStart.toISOString();
  const nextMonthStartIso = nextMonthStart.toISOString();
  const todayKey = now.toISOString().slice(0, 10);

  const [
    { data: companiesData },
    dealsRows,
    interactionsMonthRows,
    { data: phase0MonthData },
    { data: launchesData },
    contacts,
    pendingTasks,
    completedTasksToday,
    phase0Results,
    signals,
  ] = await Promise.all([
    supabase.from("companies").select(
      "id, status, buying_signal, cadence_status, last_interaction_at, vgv_projected, monthly_media_spend",
    ),
    getDealsForMetrics(),
    getInteractionRowsForMetrics(monthStartIso, nextMonthStartIso),
    supabase
      .from("phase0_results")
      .select("company_id")
      .gte("created_at", monthStartIso)
      .lt("created_at", nextMonthStartIso),
    supabase.from("company_launches").select("status"),
    countRows("contacts"),
    countRows("daily_tasks", (query) =>
      query.select("id", { count: "exact", head: true }).eq("status", "pending"),
    ),
    countRows("daily_tasks", (query) =>
      query
        .select("id", { count: "exact", head: true })
        .eq("status", "done")
        .gte("done_at", todayKey),
    ),
    countRows("phase0_results"),
    countRows("account_signals"),
  ]);

  const companiesRows = (companiesData ?? []) as CompanyRow[];
  const phase0MonthRows = (phase0MonthData ?? []) as Phase0Row[];
  const launchesRows = (launchesData ?? []) as LaunchRow[];

  const companies = companiesRows.length;
  const hotAccounts = companiesRows.filter((row) => row.buying_signal === "hot").length;
  const activeCadences = companiesRows.filter((row) => row.cadence_status === "active").length;
  const customers = companiesRows.filter((row) => row.status === "customer").length;
  const vgvProjected = sumValues(companiesRows, (row) => row.vgv_projected);
  const mediaSpend = sumValues(companiesRows, (row) => row.monthly_media_spend);

  const deals = dealsRows.length;
  const openDealsRows = dealsRows.filter((row) => !["Fechado - Ganho", "Fechado - Perdido"].includes(normalizeDealStage(row)));
  const openDeals = openDealsRows.length;
  const pipelineValue = sumValues(openDealsRows, (row) => row.value);
  const wonDeals = dealsRows.filter((row) => normalizeDealStage(row) === "Fechado - Ganho").length;
  const proposalDeals = dealsRows.filter((row) => ["Proposta", "Negociação"].includes(normalizeDealStage(row))).length;

  const monthProspectedCompanies = new Set<string>();
  interactionsMonthRows.forEach((row) => {
    if (row.company_id) monthProspectedCompanies.add(row.company_id);
  });
  phase0MonthRows.forEach((row) => {
    if (row.company_id) monthProspectedCompanies.add(row.company_id);
  });
  const prospectedAccountsMonth = monthProspectedCompanies.size;

  const meetingsFromInteractions = interactionsMonthRows.filter((row) => row.interaction_type === "meeting").length;
  const meetingsFromStatus = companiesRows.filter((row) =>
    row.status === "meeting_booked"
    && row.last_interaction_at
    && row.last_interaction_at >= monthStartIso
    && row.last_interaction_at < nextMonthStartIso,
  ).length;
  const meetingsMonth = Math.max(meetingsFromInteractions, meetingsFromStatus);

  const proposalsFromInteractions = interactionsMonthRows.filter((row) => row.interaction_type === "proposal_sent").length;
  const proposalsFromDeals = dealsRows.filter((row) =>
    Boolean(row.created_at)
    && row.created_at! >= monthStartIso
    && row.created_at! < nextMonthStartIso
    && ["Proposta", "Negociação", "Fechado - Ganho"].includes(normalizeDealStage(row)),
  ).length;
  const proposalsMonth = Math.max(proposalsFromInteractions, proposalsFromDeals);

  const wonDealsMonth = dealsRows.filter((row) =>
    normalizeDealStage(row) === "Fechado - Ganho"
    && Boolean(row.created_at)
    && row.created_at! >= monthStartIso
    && row.created_at! < nextMonthStartIso,
  ).length;

  const totalWorkingDays = getMonthWorkingDays(now.getFullYear(), now.getMonth());
  const remainingWorkingDays = getRemainingWorkingDaysInMonth(now);
  const elapsedWorkingDays = Math.max(
    totalWorkingDays - remainingWorkingDays + (isWorkingDay(now) ? 1 : 0),
    0,
  );

  const accountsTarget = PIPA_GTM_CONTEXT.commercialGoal.monthlyAccountsInPhase0;
  const meetingsTarget = PIPA_GTM_CONTEXT.commercialGoal.monthlyNewContracts * 10;
  const proposalsTarget = PIPA_GTM_CONTEXT.commercialGoal.monthlyNewContracts * 2;
  const contractsTarget = PIPA_GTM_CONTEXT.commercialGoal.monthlyNewContracts;
  const mrrTarget = PIPA_GTM_CONTEXT.commercialGoal.targetMrr;
  const actualMrr = wonDealsMonth * PIPA_GTM_CONTEXT.commercialGoal.averageTicket;

  const requiredPhase0PerWorkingDay = Math.ceil(
    Math.max(accountsTarget - prospectedAccountsMonth, 0) / Math.max(remainingWorkingDays, 1),
  );
  const requiredMeetingsPerWorkingDay = Math.ceil(
    Math.max(meetingsTarget - meetingsMonth, 0) / Math.max(remainingWorkingDays, 1),
  );

  const contactCoverage = companies > 0 ? (contacts / Math.max(companies * 2, 1)) * 100 : 0;
  const phase0Coverage = companies > 0 ? (phase0Results / companies) * 100 : 0;
  const proposalCloseRate = deals > 0 ? (wonDeals / deals) * 100 : 0;
  const launchActivation = launchesRows.length > 0
    ? (launchesRows.filter((row) => row.status === "active").length / launchesRows.length) * 100
    : 0;

  const goals: GoalProgress[] = [
    buildGoalProgress({
      key: "accounts_prospected",
      label: "Contas prospectadas",
      target: accountsTarget,
      actual: prospectedAccountsMonth,
      unit: "count",
      remainingWorkingDays,
      elapsedWorkingDays,
      totalWorkingDays,
      detail: "Quantas contas trabalhamos no mês entre Fase 0 e contatos outbound.",
    }),
    buildGoalProgress({
      key: "meetings",
      label: "Reuniões",
      target: meetingsTarget,
      actual: meetingsMonth,
      unit: "count",
      remainingWorkingDays,
      elapsedWorkingDays,
      totalWorkingDays,
      detail: "Meta mensal de reuniões necessárias para sustentar o funil reverso.",
    }),
    buildGoalProgress({
      key: "proposals",
      label: "Propostas",
      target: proposalsTarget,
      actual: proposalsMonth,
      unit: "count",
      remainingWorkingDays,
      elapsedWorkingDays,
      totalWorkingDays,
      detail: "Propostas enviadas ou oportunidades maduras o suficiente para proposta.",
    }),
    buildGoalProgress({
      key: "contracts",
      label: "Contratos ganhos",
      target: contractsTarget,
      actual: wonDealsMonth,
      unit: "count",
      remainingWorkingDays,
      elapsedWorkingDays,
      totalWorkingDays,
      detail: "Novos contratos fechados no mês.",
    }),
    buildGoalProgress({
      key: "new_mrr",
      label: "MRR novo",
      target: mrrTarget,
      actual: actualMrr,
      unit: "currency",
      remainingWorkingDays,
      elapsedWorkingDays,
      totalWorkingDays,
      detail: "MRR novo realizado contra a meta comercial da Pipa.",
    }),
  ];

  const executive: ExecutiveStat[] = [
    {
      label: "Contas em base",
      value: compactNumber(companies),
      detail: `${hotAccounts} burning para atacar agora`,
      tone: hotAccounts > 0 ? "good" : "neutral",
    },
    {
      label: "Contas prospectadas no mês",
      value: compactNumber(prospectedAccountsMonth),
      detail: `meta ${compactNumber(accountsTarget)} no mês`,
      tone: goals[0].health === "good" ? "good" : goals[0].health === "risk" ? "attention" : "primary",
    },
    {
      label: "Leads na base",
      value: compactNumber(contacts),
      detail: `${percent(contactCoverage)} de cobertura por conta`,
      tone: contactCoverage >= 100 ? "good" : "neutral",
    },
    {
      label: "Pipeline aberto",
      value: brl(pipelineValue),
      detail: `${compactNumber(openDeals)} negócios ainda em aberto`,
      tone: pipelineValue > 0 ? "primary" : "neutral",
    },
    {
      label: "Reuniões do mês",
      value: compactNumber(meetingsMonth),
      detail: `meta ${compactNumber(meetingsTarget)}`,
      tone: goals[1].health === "good" ? "good" : "attention",
    },
    {
      label: "Propostas do mês",
      value: compactNumber(proposalsMonth),
      detail: `meta ${compactNumber(proposalsTarget)}`,
      tone: goals[2].health === "good" ? "good" : "attention",
    },
    {
      label: "Contratos ganhos no mês",
      value: compactNumber(wonDealsMonth),
      detail: `meta ${compactNumber(contractsTarget)}`,
      tone: goals[3].health === "good" ? "good" : "attention",
    },
    {
      label: "MRR novo",
      value: brl(actualMrr),
      detail: `meta ${brl(mrrTarget)}`,
      tone: goals[4].health === "good" ? "good" : "attention",
    },
  ];

  const pipeline: PipelineStageMetric[] = [
    {
      label: "Qualificação",
      count: dealsRows.filter((row) => normalizeDealStage(row) === "Qualificação").length,
      value: sumValues(dealsRows.filter((row) => normalizeDealStage(row) === "Qualificação"), (row) => row.value),
    },
    {
      label: "Proposta",
      count: dealsRows.filter((row) => normalizeDealStage(row) === "Proposta").length,
      value: sumValues(dealsRows.filter((row) => normalizeDealStage(row) === "Proposta"), (row) => row.value),
    },
    {
      label: "Negociação",
      count: dealsRows.filter((row) => normalizeDealStage(row) === "Negociação").length,
      value: sumValues(dealsRows.filter((row) => normalizeDealStage(row) === "Negociação"), (row) => row.value),
    },
    {
      label: "Fechado - Ganho",
      count: dealsRows.filter((row) => normalizeDealStage(row) === "Fechado - Ganho").length,
      value: sumValues(dealsRows.filter((row) => normalizeDealStage(row) === "Fechado - Ganho"), (row) => row.value),
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    calendar: {
      remainingWorkingDays,
      totalWorkingDays,
      elapsedWorkingDays,
      requiredPhase0PerWorkingDay,
      requiredMeetingsPerWorkingDay,
    },
    goals,
    executive,
    pipeline,
    presales: [
      {
        label: "Contas em base",
        value: String(companies),
        detail: `${hotAccounts} burning para priorizar`,
        health: hotAccounts > 0 ? "good" : "attention",
      },
      {
        label: "Fase 0 concluida",
        value: String(phase0Results),
        detail: `${percent(phase0Coverage)} da base com diagnostico`,
        health: phase0Coverage >= 25 ? "good" : "attention",
      },
      {
        label: "Sinais de compra",
        value: String(signals),
        detail: "Lancamento, hiring, midia, resposta lenta e follow-up",
        health: signals > 0 ? "good" : "neutral",
      },
      {
        label: "Acoes pendentes",
        value: String(pendingTasks),
        detail: `${completedTasksToday} concluidas hoje`,
        health: pendingTasks > 30 ? "risk" : pendingTasks > 0 ? "attention" : "good",
      },
    ],
    sales: [
      {
        label: "Negocios abertos",
        value: String(openDeals),
        detail: `${proposalDeals} em proposta ou negociacao`,
        health: openDeals > 0 ? "good" : "attention",
      },
      {
        label: "Pipeline",
        value: brl(pipelineValue),
        detail: "Valor total aberto em negocios ativos",
        health: pipelineValue > 0 ? "good" : "attention",
      },
      {
        label: "Contratos ganhos",
        value: String(wonDealsMonth),
        detail: `Meta GTM: ${contractsTarget} novos contratos por mes`,
        health: wonDealsMonth >= contractsTarget ? "good" : wonDealsMonth > 0 ? "attention" : "risk",
      },
      {
        label: "Conversao geral",
        value: percent(proposalCloseRate),
        detail: "Fechados ganhos sobre negocios registrados",
        health: proposalCloseRate >= 20 ? "good" : proposalCloseRate > 0 ? "attention" : "neutral",
      },
    ],
    expansion: [
      {
        label: "Clientes",
        value: String(customers),
        detail: "Contas em status cliente",
        health: customers > 0 ? "good" : "attention",
      },
      {
        label: "Lancamentos mapeados",
        value: String(launchesRows.length),
        detail: `${percent(launchActivation)} ativos`,
        health: launchesRows.length > 0 ? "good" : "attention",
      },
      {
        label: "VGV projetado",
        value: brl(vgvProjected),
        detail: "Base para narrativa de VGV recuperado",
        health: vgvProjected > 0 ? "good" : "attention",
      },
      {
        label: "Cobertura de pessoas",
        value: percent(contactCoverage),
        detail: "Referencia minima: 2 pessoas por conta",
        health: contactCoverage >= 100 ? "good" : contactCoverage >= 50 ? "attention" : "risk",
      },
    ],
    efficiency: [
      {
        label: "Midia mensal mapeada",
        value: brl(mediaSpend),
        detail: "Orcamento sob risco no buraco negro",
        health: mediaSpend > 0 ? "good" : "attention",
      },
      {
        label: "Cadencias ativas",
        value: String(activeCadences),
        detail: "Devem sempre ter conta e pessoas vinculadas",
        health: activeCadences > 0 ? "good" : "attention",
      },
      {
        label: "Ritmo Fase 0",
        value: `${requiredPhase0PerWorkingDay}/dia`,
        detail: "Forcado para sustentar a meta mensal de prospeccao",
        health: requiredPhase0PerWorkingDay <= 3 ? "good" : requiredPhase0PerWorkingDay <= 6 ? "attention" : "risk",
      },
      {
        label: "Ritmo reunioes",
        value: `${requiredMeetingsPerWorkingDay}/dia`,
        detail: "Forcado para sustentar a meta mensal de reunioes",
        health: requiredMeetingsPerWorkingDay <= 1 ? "good" : requiredMeetingsPerWorkingDay <= 2 ? "attention" : "risk",
      },
    ],
  };
}
