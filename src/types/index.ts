export type Role = 'admin' | 'manager' | 'rep' | 'viewer' | 'user';

export interface Profile {
  id: string;
  role: Role;
  name: string | null;
  email?: string | null;
  team_id?: string | null;
  is_active?: boolean;
  created_at: string;
}

export interface User {
  id: string;
  email: string | undefined;
  profile: Profile | null;
}

// ── CRM ─────────────────────────────────────────────────

export interface Funnel {
  id: string;
  name: string;
  created_at: string;
}

export type BuyingSignal = 'hot' | 'warm' | 'cold';
export type CompanyStatus = 'new' | 'prospecting' | 'contacted' | 'meeting_booked' | 'proposal' | 'customer' | 'lost';
export type SalesModel = 'internal' | 'external' | 'hybrid';
export type ScoreTier = 'A' | 'B' | 'C';
export type ContactLifecycleStage =
  | 'subscriber'
  | 'lead'
  | 'mql'
  | 'sql'
  | 'opportunity'
  | 'customer'
  | 'evangelist'
  | 'disqualified';

export interface CompanyLaunch {
  id: string;
  company_id: string;
  name: string;
  status: 'active' | 'upcoming' | 'sold_out' | 'cancelled';
  launch_date: string | null;
  delivery_date: string | null;
  units_total: number | null;
  units_sold: number | null;
  vgv: number | null;
  price_per_sqm: number | null;
  address: string | null;
  city: string | null;
  neighborhood: string | null;
  website_url: string | null;
  landing_page_url: string | null;
  instagram_url: string | null;
  notes: string | null;
  created_at: string;
}

export interface Company {
  id: string;
  name: string;
  cnpj: string | null;
  city: string | null;
  segment: string | null;
  website: string | null;
  owner_id: string;
  created_at: string;
  // ABM / Intelligence
  status: CompanyStatus;
  score_tier: ScoreTier;
  buying_signal: BuyingSignal;
  icp_score: number;
  sales_model: SalesModel | null;
  has_active_launch: boolean;
  upcoming_launch: boolean;
  launch_count_year: number;
  vgv_projected: number | null;
  monthly_media_spend: number | null;
  cadence_status: string;
  cadence_day: number;
  cadence_started_at: string | null;
  last_interaction_at: string | null;
  linkedin_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  connection_count: number;
  domain: string | null;
  employees_count: number | null;
  founded_year: number | null;
  state: string | null;
  custom_data?: Record<string, unknown> | null;
  owner?: Pick<Profile, 'id' | 'name'> | null;
}

export interface Contact {
  id: string;
  name: string;
  role: string | null;   // cargo
  email: string | null;
  phone?: string | null;
  whatsapp: string | null;
  company_id: string | null;
  lifecycle_stage?: ContactLifecycleStage | null;
  source: string | null;
  owner_id: string;
  created_at: string;
  // Apollo / enrichment (opcionais — populados pelo enrich)
  apollo_person_id?: string | null;
  linkedin_url?: string | null;
  seniority?: string | null;
  departments?: string[] | null;
  enriched_at?: string | null;
  enrichment_source?: string | null;
  custom_data?: Record<string, unknown> | null;
  company?: Pick<Company, 'id' | 'name'> | null;
  owner?: Pick<Profile, 'id' | 'name'> | null;
}

export interface Deal {
  id: string;
  title: string;
  value: number | null;
  stage_id: string | null;
  /** Derived label from `stages.name`; never persisted on `deals`. */
  stage_name: string;
  funnel_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  owner_id: string;
  expected_close: string | null;
  created_at: string;
  custom_data?: Record<string, unknown> | null;
  stage_ref?: { id?: string; name: string; color?: string | null; order?: number | null } | null;
  funnel?: Pick<Funnel, 'id' | 'name'> | null;
  contact?: (Pick<Contact, 'id' | 'name'> & Partial<Pick<Contact, 'email' | 'whatsapp' | 'phone' | 'role'>>) | null;
  company?: (Pick<Company, 'id' | 'name'> & Partial<Pick<Company, 'city' | 'segment' | 'buying_signal'>>) | null;
  owner?: Pick<Profile, 'id' | 'name'> | null;
}

export type DealStage =
  | 'Qualificação'
  | 'Proposta'
  | 'Negociação'
  | 'Fechado - Ganho'
  | 'Fechado - Perdido';

export const DEAL_STAGES: DealStage[] = [
  'Qualificação',
  'Proposta',
  'Negociação',
  'Fechado - Ganho',
  'Fechado - Perdido',
];

export const CONTACT_SOURCES = [
  'Website',
  'Indicação',
  'LinkedIn',
  'Instagram',
  'Google',
  'Outro',
] as const;

export const COMPANY_SEGMENTS = [
  'Incorporadora',
  'Construtora',
  'Imobiliária',
  'Corretor',
  'Outro',
] as const;

// ── Automação / Sequências ────────────────────────────────

export interface FunnelStage {
  id: string;
  funnel_id: string;
  name: string;
  position: number;
}

export type SequenceChannel = 'whatsapp' | 'email' | 'both';
export type SequenceTriggerType = 'manual' | 'stage_change' | 'signal_threshold' | 'recurring' | 'date_anchored';

export interface SequenceStep {
  id: string;
  sequence_id: string;
  position: number;
  channel: SequenceChannel;
  delay_days: number;
  template: string;
}

export interface Sequence {
  id: string;
  name: string;
  funnel_id: string | null;
  stage_id: string | null;
  channel?: SequenceChannel | null;
  trigger_type?: SequenceTriggerType | null;
  trigger_config?: Record<string, unknown> | null;
  target_role?: string | null;
  stop_on_reply?: boolean | null;
  max_enrollments_per_day?: number | null;
  active: boolean;
  created_at: string;
  funnel?: Pick<Funnel, 'id' | 'name'>;
  stage?: Pick<FunnelStage, 'id' | 'name'>;
  steps?: SequenceStep[];
  steps_v2?: Array<{
    id: string;
    sequence_id: string;
    position: number;
    step_type: string;
    config: Record<string, unknown>;
  }>;
}

// ── Pipeline Engine (Track I) ─────────────────────────────

export const BUYING_ROLES = [
  'decision_maker', 'economic_buyer', 'champion', 'influencer', 'user',
  'technical', 'legal', 'finance', 'blocker', 'unknown',
] as const;

export type BuyingRole = typeof BUYING_ROLES[number];

export const BUYING_ROLE_LABELS: Record<BuyingRole, string> = {
  decision_maker: 'Decisor',
  economic_buyer: 'Comprador Econômico',
  champion: 'Champion',
  influencer: 'Influenciador',
  user: 'Usuário',
  technical: 'Técnico',
  legal: 'Jurídico',
  finance: 'Financeiro',
  blocker: 'Bloqueador',
  unknown: 'Desconhecido',
};

export interface DealContact {
  id: string;
  account_id: string;
  deal_id: string;
  contact_id: string;
  buying_role: BuyingRole;
  role_confidence: number;
  engagement_score: number;
  added_at: string;
  added_by: string | null;
  removed_at: string | null;
  // Joined
  contact?: Pick<Contact, 'id' | 'name' | 'role' | 'email' | 'whatsapp'> | null;
}

export type QuotaPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly';

export interface Quota {
  id: string;
  account_id: string;
  user_id: string | null;
  period_type: QuotaPeriod;
  period_start: string;
  period_end: string;
  meetings_target: number;
  pipeline_target_brl: number;
  revenue_target_brl: number;
  created_at: string;
}

export interface QuotaPacing extends Quota {
  bdr: number; // business_days_remaining
  meetings_held: number;
  attainment_pct: number | null;
}

export interface DealStateSnapshot {
  id: number;
  account_id: string;
  snapshot_date: string;
  deal_id: string;
  stage: string | null;
  value_brl: number | null;
  owner_id: string | null;
  momentum: number | null;
  captured_at: string;
}

// ── Reply Intelligence (Track H) ─────────────────────────

export const REPLY_CLASSIFICATIONS = [
  'positive_intent', 'meeting_requested', 'not_now', 'not_interested',
  'out_of_office', 'wrong_person', 'referral', 'unsubscribe_request', 'unclear',
] as const;

export type ReplyClassification = typeof REPLY_CLASSIFICATIONS[number];

export const REPLY_CLASSIFICATION_LABELS: Record<ReplyClassification, string> = {
  positive_intent: 'Interesse positivo',
  meeting_requested: 'Reunião solicitada',
  not_now: 'Não agora',
  not_interested: 'Sem interesse',
  out_of_office: 'Fora do escritório',
  wrong_person: 'Pessoa errada',
  referral: 'Indicação',
  unsubscribe_request: 'Descadastrar',
  unclear: 'Incerto',
};

export const SUPPRESSION_REASONS = [
  'unsubscribe', 'not_interested', 'wrong_person', 'manual', 'bounce',
] as const;

export type SuppressionReason = typeof SUPPRESSION_REASONS[number];

export interface SuppressionEntry {
  id: string;
  account_id: string;
  contact_id: string | null;
  wa_phone_e164: string | null;
  reason: SuppressionReason;
  source_activity_id: string | null;
  created_at: string;
  created_by: string | null;
  expires_at: string | null;
}

