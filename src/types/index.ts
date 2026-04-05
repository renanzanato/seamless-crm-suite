export type Role = 'admin' | 'user';

export interface Profile {
  id: string;
  role: Role;
  name: string | null;
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

export interface Company {
  id: string;
  name: string;
  cnpj: string | null;
  city: string | null;
  segment: string | null;
  website: string | null;
  owner_id: string;
  created_at: string;
  owner?: Pick<Profile, 'id' | 'name'> | null;
}

export interface Contact {
  id: string;
  name: string;
  role: string | null;   // cargo
  email: string | null;
  whatsapp: string | null;
  company_id: string | null;
  source: string | null;
  owner_id: string;
  created_at: string;
  company?: Pick<Company, 'id' | 'name'> | null;
  owner?: Pick<Profile, 'id' | 'name'> | null;
}

export interface Deal {
  id: string;
  title: string;
  value: number | null;
  stage: string;
  funnel_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  owner_id: string;
  expected_close: string | null;
  created_at: string;
  funnel?: Pick<Funnel, 'id' | 'name'> | null;
  contact?: Pick<Contact, 'id' | 'name'> | null;
  company?: Pick<Company, 'id' | 'name'> | null;
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

export type SequenceChannel = 'whatsapp' | 'email';

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
  funnel_id: string;
  stage_id: string;
  active: boolean;
  created_at: string;
  funnel?: Pick<Funnel, 'id' | 'name'>;
  stage?: Pick<FunnelStage, 'id' | 'name'>;
  steps?: SequenceStep[];
}
