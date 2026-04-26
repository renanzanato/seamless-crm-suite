import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft, Flame, Thermometer, Snowflake, Rocket, ExternalLink,
  Users, MessageSquare, Linkedin, Phone, Plus, Mail,
  TrendingUp, BarChart3, Globe, Instagram, Play, CheckCircle2,
  Zap, Clock, AlertCircle, Pencil, StickyNote, Loader2, Briefcase,
} from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { PageTransition } from '@/components/PageTransition';
import { Can } from '@/components/Can';
import { ContactForm } from '@/components/crm/ContactForm';
import { DealForm } from '@/components/crm/DealForm';
import { InlineEdit, type InlineEditValue } from '@/components/crm/InlineEdit';
import { LaunchForm } from '@/components/crm/LaunchForm';
import { SignalManager } from '@/components/crm/SignalManager';
import { WhatsAppTimeline } from '@/components/crm/WhatsAppTimeline';
import { ActivityTimeline } from '@/components/activities/ActivityTimeline';
import { LogCallModal } from '@/components/activities/LogCallModal';
import { CreateTaskModal } from '@/components/activities/CreateTaskModal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { getCompanyCadenceDay } from '@/lib/cadence';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { startCadenceForContacts, getInteractions, type Interaction } from '@/services/abmService';
import { createNoteActivity, updateCompanyProperty } from '@/services/activitiesService';
import { invokeAutomationWebhook } from '@/services/integrationService';
import type { Company, Contact, CompanyLaunch, BuyingSignal, Deal } from '@/types';

// ── Helpers ──────────────────────────────────────────────

const SIGNAL_CFG: Record<BuyingSignal, { label: string; icon: React.ElementType; style: string }> = {
  hot:  { label: 'Burning — conta prioritária',  icon: Flame,       style: 'text-orange-500' },
  warm: { label: 'Aquecida — boa oportunidade',  icon: Thermometer, style: 'text-yellow-500' },
  cold: { label: 'Fria — sem sinais claros',     icon: Snowflake,   style: 'text-blue-400' },
};

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  new_launch: 'Novo lançamento previsto',
  hiring_sales: 'Contratando time comercial',
  hiring_marketing: 'Contratando time de marketing',
  running_ads: 'Rodando mídia paga',
  slow_response: 'Lead oculto: resposta lenta',
  no_followup: 'Lead oculto: sem follow-up',
  vgv_pressure: 'Pressão de VGV',
  competitor_change: 'Mudança de concorrente/parceiro',
  funding: 'Captação / investimento',
  custom: 'Sinal personalizado',
};

const COMPANY_STATUS_OPTIONS = [
  { value: 'new', label: 'Nova' },
  { value: 'prospecting', label: 'Em prospeccao' },
  { value: 'contacted', label: 'Contactada' },
  { value: 'meeting_booked', label: 'Reuniao marcada' },
  { value: 'proposal', label: 'Proposta' },
  { value: 'customer', label: 'Cliente' },
  { value: 'lost', label: 'Perdida' },
];

const BUYING_SIGNAL_OPTIONS = [
  { value: 'hot', label: 'Quente' },
  { value: 'warm', label: 'Morno' },
  { value: 'cold', label: 'Frio' },
];

const SALES_MODEL_OPTIONS = [
  { value: 'internal', label: 'Interno' },
  { value: 'external', label: 'Externo' },
  { value: 'hybrid', label: 'Hibrido' },
];

interface CompanySignal {
  id: string;
  signal_type: string;
  description: string | null;
  detected_at: string;
  source: string;
}

type CompanyDeal = Pick<Deal, 'id' | 'title' | 'value' | 'stage' | 'expected_close' | 'contact_id'> & {
  contact?: Pick<Contact, 'id' | 'name'> | null;
};

function fmtVGV(v: number | null) {
  if (!v) return '—';
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(0)}M`;
  return `R$ ${(v / 1_000).toFixed(0)}k`;
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  const [year, month, day] = d.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
}

function toWhatsAppHref(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}`;
}

// ── Launches Tab ─────────────────────────────────────────

function LaunchCard({
  launch,
  onEdit,
  canEdit,
}: {
  launch: CompanyLaunch;
  onEdit: (launch: CompanyLaunch) => void;
  canEdit: boolean;
}) {
  const statusColor: Record<string, string> = {
    active:    'bg-green-500/15 text-green-600',
    upcoming:  'bg-blue-500/15 text-blue-500',
    sold_out:  'bg-muted text-muted-foreground',
    cancelled: 'bg-destructive/15 text-destructive',
  };
  const statusLabel: Record<string, string> = {
    active: 'Ativo', upcoming: 'Previsto', sold_out: 'Esgotado', cancelled: 'Cancelado',
  };

  const pctSold = launch.units_total && launch.units_sold
    ? Math.round((launch.units_sold / launch.units_total) * 100)
    : null;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="font-semibold">{launch.name}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[launch.status]}`}>
                {statusLabel[launch.status]}
              </span>
            </div>
            {launch.neighborhood && (
              <p className="text-xs text-muted-foreground">{launch.neighborhood}{launch.city ? `, ${launch.city}` : ''}</p>
            )}
          </div>
          <div className="flex items-start gap-2 shrink-0">
            {launch.vgv && (
              <div className="text-right shrink-0">
                <p className="font-bold text-sm">{fmtVGV(launch.vgv)}</p>
                <p className="text-xs text-muted-foreground">VGV</p>
              </div>
            )}
            {canEdit && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="Editar lançamento"
                onClick={() => onEdit(launch)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs mb-3">
          <div>
            <p className="text-muted-foreground">Unidades</p>
            <p className="font-medium">{launch.units_total ?? '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Lançamento</p>
            <p className="font-medium">{fmtDate(launch.launch_date)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Entrega</p>
            <p className="font-medium">{fmtDate(launch.delivery_date)}</p>
          </div>
        </div>

        {pctSold !== null && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Vendas</span>
              <span className="font-medium">{pctSold}% vendido</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pctSold}%` }} />
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {launch.website_url && (
            <a href={launch.website_url} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                <Globe className="h-3 w-3" /> Site
              </Button>
            </a>
          )}
          {launch.landing_page_url && (
            <a href={launch.landing_page_url} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                <ExternalLink className="h-3 w-3" /> Landing Page
              </Button>
            </a>
          )}
          {launch.instagram_url && (
            <a href={launch.instagram_url} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                <Instagram className="h-3 w-3" /> Instagram
              </Button>
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Contacts Tab ─────────────────────────────────────────

function ContactRow({ contact }: { contact: Contact }) {
  const whatsappHref = contact.whatsapp ? toWhatsAppHref(contact.whatsapp) : null;

  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-primary">{contact.name.slice(0, 2).toUpperCase()}</span>
        </div>
        <div>
          <p className="text-sm font-medium">{contact.name}</p>
          <p className="text-xs text-muted-foreground">{contact.role || '—'}</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/20">
          Sugerido
        </Badge>
        {whatsappHref && (
          <a href={whatsappHref} target="_blank" rel="noreferrer">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-green-500">
              <MessageSquare className="h-3.5 w-3.5" />
            </Button>
          </a>
        )}
        {contact.email && (
          <a href={`mailto:${contact.email}`}>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Mail className="h-3.5 w-3.5" />
            </Button>
          </a>
        )}
      </div>
    </div>
  );
}

// ── Cadence Tab ──────────────────────────────────────────

function CadenceTimeline({ company, contacts }: { company: Company; contacts: Contact[] }) {
  const qc = useQueryClient();
  const startMutation = useMutation({
    mutationFn: () => startCadenceForContacts({
      companyId: company.id,
      companyName: company.name,
      contacts: contacts.map((contact) => ({
        id: contact.id,
        name: contact.name,
        role: contact.role,
      })),
    }),
    onSuccess: (createdTasks) => {
      qc.invalidateQueries({ queryKey: ['company', company.id] });
      qc.invalidateQueries({ queryKey: ['daily-tasks'] });
      toast.success(`Cadência iniciada com ${createdTasks} ações. Acesse "Comando do Dia".`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const steps = [
    { day: 1,  block: 1, label: 'Diagnóstico + primeiro contato',    channels: ['WhatsApp', 'LinkedIn'],  personas: ['CMO', 'Dir. Comercial'] },
    { day: 3,  block: 1, label: 'Envio do vídeo Loom (diagnóstico)', channels: ['WhatsApp'],              personas: ['CMO', 'Dir. Comercial'] },
    { day: 4,  block: 1, label: 'Ligação de follow-up',              channels: ['Telefone'],              personas: ['CMO', 'Dir. Comercial'] },
    { day: 5,  block: 2, label: 'Escalada para o Sócio',             channels: ['WhatsApp', 'LinkedIn'],  personas: ['Sócio / CEO'] },
    { day: 8,  block: 2, label: 'Diagnóstico interativo + calculadora', channels: ['WhatsApp'],           personas: ['Todos'] },
    { day: 12, block: 3, label: 'Case de sucesso',                   channels: ['WhatsApp'],              personas: ['Todos'] },
    { day: 15, block: 3, label: 'Follow-up persistência (foco Sócio)', channels: ['WhatsApp', 'Telefone'], personas: ['Sócio / CEO'] },
    { day: 21, block: 3, label: 'Break-up de integridade',           channels: ['WhatsApp'],              personas: ['Todos'] },
  ];

  const blockColors: Record<number, string> = {
    1: 'border-blue-500 bg-blue-500',
    2: 'border-purple-500 bg-purple-500',
    3: 'border-orange-500 bg-orange-500',
  };
  const blockLabels: Record<number, string> = {
    1: 'Bloco 1 — Cerco Operacional',
    2: 'Bloco 2 — Escalada C-Level',
    3: 'Bloco 3 — Prova + Fechamento',
  };

  const isActive = company.cadence_status === 'active';
  const currentDay = getCompanyCadenceDay(company);
  const hasPeople = contacts.length >= 2;

  if (company.cadence_status === 'not_started' || !company.cadence_status) {
    return (
      <div className="text-center py-10">
        <Zap className="h-10 w-10 text-primary mx-auto mb-3" />
        <p className="font-semibold mb-1">Cadência não iniciada</p>
        <p className="text-sm text-muted-foreground mb-4 max-w-xs mx-auto">
          Cadências da Pipa sempre rodam por conta e por pessoas. Cadastre pelo menos 2 pessoas-chave.
        </p>
        <Button onClick={() => startMutation.mutate()} disabled={startMutation.isPending || !hasPeople}>
          {startMutation.isPending ? 'Iniciando…' : hasPeople ? 'Iniciar com pessoas-chave' : 'Adicione pessoas primeiro'}
        </Button>
      </div>
    );
  }

  let lastBlock = 0;
  return (
    <div className="space-y-1">
      {isActive && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4 p-3 rounded-lg bg-muted/40">
          <Clock className="h-4 w-4 text-primary" />
          <span>Dia <strong className="text-foreground">{currentDay}</strong> de 21 — cadência ativa</span>
        </div>
      )}
      {steps.map((step) => {
        const showBlockLabel = step.block !== lastBlock;
        lastBlock = step.block;
        const isDone = currentDay > step.day;
        const isCurrent = currentDay === step.day;

        return (
          <div key={step.day}>
            {showBlockLabel && (
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-4 mb-2">
                {blockLabels[step.block]}
              </p>
            )}
            <div className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${isCurrent ? 'bg-primary/5 border border-primary/20' : 'hover:bg-muted/30'}`}>
              {/* Step indicator */}
              <div className={`h-7 w-7 rounded-full border-2 flex items-center justify-center shrink-0 text-xs font-bold ${blockColors[step.block]} text-white`}>
                {isDone ? <CheckCircle2 className="h-4 w-4" /> : step.day}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-sm font-medium ${isDone ? 'line-through text-muted-foreground' : ''}`}>
                    {step.label}
                  </p>
                  {isCurrent && <Badge className="text-xs bg-primary/15 text-primary border-0">Hoje</Badge>}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {step.channels.map(ch => (
                    <span key={ch} className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{ch}</span>
                  ))}
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">{step.personas.join(', ')}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Activities Legacy Tab ────────────────────────────────

function InteractionFeed({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const { data: interactions = [], isLoading } = useQuery({
    queryKey: ['company-legacy-activities', companyId],
    queryFn: () => getInteractions(companyId),
  });

  useEffect(() => {
    const channel = supabase
      .channel(`company-activities-${companyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'activities',
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ['company-legacy-activities', companyId] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, qc]);

  const typeIcon: Record<string, React.ElementType> = {
    whatsapp_sent: MessageSquare, whatsapp_received: MessageSquare,
    call_made: Phone, call_received: Phone,
    linkedin_sent: Linkedin, linkedin_received: Linkedin,
    meeting: Users, note: AlertCircle,
    phase0_test: BarChart3, cadence_step: Zap,
  };

  const typeLabel: Record<string, string> = {
    whatsapp_sent: 'WhatsApp enviado', whatsapp_received: 'WhatsApp recebido',
    call_made: 'Ligação feita', call_received: 'Ligação recebida',
    linkedin_sent: 'LinkedIn enviado', linkedin_received: 'LinkedIn recebido',
    meeting: 'Reunião', note: 'Nota',
    phase0_test: 'Lead oculto (Fase 0)', cadence_step: 'Passo de cadência',
  };

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (interactions.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Nenhuma interação registrada.</p>
        <p className="text-xs mt-1">As interações aparecem conforme você executa a cadência.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {interactions.map((i: Interaction) => {
        const Icon = typeIcon[i.interaction_type] || MessageSquare;
        return (
          <div key={i.id} className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium">{typeLabel[i.interaction_type] || i.interaction_type}</p>
                {i.contact?.name && <span className="text-xs text-muted-foreground">→ {i.contact.name}</span>}
                {(typeof i.metadata?.source === 'string' || typeof i.metadata?.provider === 'string') && (
                  <Badge variant="outline" className="text-[10px] h-5">
                    {String(i.metadata?.source || i.metadata?.provider)}
                  </Badge>
                )}
              </div>
              {i.content && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{i.content}</p>}
              {i.summary && <p className="text-xs text-primary mt-0.5 italic">{i.summary}</p>}
              <p className="text-xs text-muted-foreground/60 mt-1">
                {new Date(i.created_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SidebarContactRow({
  contact,
  onOpen,
}: {
  contact: Contact;
  onOpen: (id: string) => void;
}) {
  const whatsappHref = contact.whatsapp ? toWhatsAppHref(contact.whatsapp) : null;

  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <button
        type="button"
        onClick={() => onOpen(contact.id)}
        className="block w-full text-left"
      >
        <p className="truncate text-sm font-medium hover:text-primary hover:underline">{contact.name}</p>
        <p className="truncate text-xs text-muted-foreground">{contact.role || 'Cargo não informado'}</p>
      </button>
      <div className="mt-2 flex items-center gap-1">
        {whatsappHref && (
          <a href={whatsappHref} target="_blank" rel="noreferrer">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-green-500">
              <MessageSquare className="h-3.5 w-3.5" />
            </Button>
          </a>
        )}
        {contact.email && (
          <a href={`mailto:${contact.email}`}>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Mail className="h-3.5 w-3.5" />
            </Button>
          </a>
        )}
      </div>
    </div>
  );
}

function SidebarDealRow({
  deal,
  onOpen,
}: {
  deal: CompanyDeal;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(deal.id)}
      className="block w-full rounded-lg border bg-background px-3 py-2 text-left transition hover:border-primary/40 hover:bg-primary/5"
    >
      <p className="line-clamp-2 text-sm font-medium">{deal.title}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>{deal.stage}</span>
        <span>·</span>
        <span>{fmtVGV(deal.value)}</span>
      </div>
      {deal.contact?.name && (
        <p className="mt-1 truncate text-xs text-muted-foreground">Contato: {deal.contact.name}</p>
      )}
    </button>
  );
}

function CompanyProperty({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="max-w-[62%] text-right text-sm font-medium">{value}</span>
    </div>
  );
}

function SignalsTab({
  signals,
  onManage,
  canManage,
}: {
  signals: CompanySignal[];
  onManage: () => void;
  canManage: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Sinais de compra</h2>
          <p className="text-sm text-muted-foreground">Eventos que alimentam o score e prioridade da conta.</p>
        </div>
        {canManage && (
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onManage}>
            <Zap className="h-4 w-4" /> Gerenciar
          </Button>
        )}
      </div>

      {signals.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <Zap className="mx-auto mb-2 h-8 w-8 opacity-30" />
            <p className="text-sm">Nenhum sinal cadastrado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {signals.map((signal) => (
            <div key={signal.id} className="rounded-lg border bg-background p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">
                  {SIGNAL_TYPE_LABELS[signal.signal_type] ?? signal.signal_type}
                </p>
                <Badge variant="outline" className="text-[10px]">{signal.source}</Badge>
              </div>
              {signal.description && (
                <p className="mt-1 text-sm text-muted-foreground">{signal.description}</p>
              )}
              <p className="mt-2 text-xs text-muted-foreground/70">
                {new Date(signal.detected_at).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAdmin, profile, session } = useAuth();
  const actorId = profile?.id ?? session?.user?.id ?? null;
  const [launchFormOpen, setLaunchFormOpen] = useState(false);
  const [editingLaunch, setEditingLaunch] = useState<CompanyLaunch | null>(null);
  const [signalManagerOpen, setSignalManagerOpen] = useState(false);
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [dealFormOpen, setDealFormOpen] = useState(false);
  const [noteDraftOpen, setNoteDraftOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [callOpen, setCallOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  const noteMutation = useMutation({
    mutationFn: (body: string) => createNoteActivity({
      companyId: id!,
      body,
      createdBy: actorId,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activities', 'company', id] });
      toast.success('Nota salva.');
      setNoteDraft('');
      setNoteDraftOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const { data: company, isLoading } = useQuery({
    queryKey: ['company', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('*, owner:profiles(id, name)')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as Company;
    },
    enabled: !!id,
  });

  const refreshAutomationQueries = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['company', id] }),
      qc.invalidateQueries({ queryKey: ['companies'] }),
      qc.invalidateQueries({ queryKey: ['account-signals', id] }),
      qc.invalidateQueries({ queryKey: ['company-legacy-activities', id] }),
      qc.invalidateQueries({ queryKey: ['daily-tasks'] }),
      qc.invalidateQueries({ queryKey: ['abm-stats'] }),
      qc.invalidateQueries({ queryKey: ['account-stats'] }),
    ]);

  const saveCompanyProperty = async (
    field: string,
    oldValue: string | number | null | undefined,
    newValue: InlineEditValue,
  ) => {
    if (!company) throw new Error('Empresa nao carregada.');
    await updateCompanyProperty({
      id: company.id,
      field,
      oldValue,
      newValue,
      createdBy: actorId,
      scope: { companyId: company.id },
    });
    await Promise.all([
      refreshAutomationQueries(),
      qc.invalidateQueries({ queryKey: ['activities', 'company', company.id] }),
    ]);
  };

  const simulateReplyMutation = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error('Conta nao carregada.');
      const primaryContact = contacts[0];
      if (!primaryContact) {
        throw new Error('Adicione pelo menos 1 pessoa-chave para testar o reply automatico.');
      }

      return invokeAutomationWebhook({
        kind: 'whatsapp_message',
        integration_name: 'whatsapp',
        source: 'whatsapp',
        external_event_id: `sim-whatsapp-${company.id}-${Date.now()}`,
        timestamp: new Date().toISOString(),
        company_id: company.id,
        contact_id: primaryContact.id,
        whatsapp: {
          direction: 'inbound',
          phone: primaryContact.whatsapp || '+55 11 99999-0000',
          message: 'Oi Renan, vi seu diagnostico. Podemos falar na semana que vem?',
          contact_name: primaryContact.name,
          contact_role: primaryContact.role || 'Diretor Comercial',
          summary: 'Lead respondeu pelo WhatsApp e pediu continuidade da conversa na proxima semana.',
          next_step: 'Responder hoje com 2 opcoes de horario para uma call de 15 min.',
          create_followup_task: true,
          signal_hints: ['vgv_pressure'],
        },
      });
    },
    onSuccess: async () => {
      await refreshAutomationQueries();
      toast.success('Reply automatico processado na conta.');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const simulateSignalMutation = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error('Conta nao carregada.');
      return invokeAutomationWebhook({
        kind: 'market_signal',
        integration_name: 'n8n',
        source: 'n8n',
        external_event_id: `sim-signal-${company.id}-${Date.now()}`,
        timestamp: new Date().toISOString(),
        company_id: company.id,
        company: {
          name: company.name,
          domain: company.domain || undefined,
        },
        market_signal: {
          type: 'new_launch',
          source: 'news',
          confidence: 0.91,
          description: `${company.name} sinalizou um novo lancamento previsto para os proximos 90 dias.`,
          create_followup_task: true,
          metadata: {
            channel: 'demo',
          },
        },
        company_updates: {
          upcoming_launch: true,
          domain: company.domain || undefined,
        },
      });
    },
    onSuccess: async () => {
      await refreshAutomationQueries();
      toast.success('Sinal de mercado processado automaticamente.');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const { data: launches = [] } = useQuery({
    queryKey: ['launches', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('company_launches')
        .select('*')
        .eq('company_id', id!)
        .order('status');
      return (data || []) as CompanyLaunch[];
    },
    enabled: !!id,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts-by-company', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('contacts')
        .select('*')
        .eq('company_id', id!)
        .in('role', ['Dir. Comercial', 'Diretor Comercial', 'Gerente de Vendas', 'CMO', 'Sócio', 'CEO', 'Co-Founder', 'Founder']);
      return (data || []) as Contact[];
    },
    enabled: !!id,
  });

  const { data: deals = [] } = useQuery({
    queryKey: ['deals-by-company', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('id, title, value, stage, expected_close, contact_id, contact:contacts(id, name)')
        .eq('company_id', id!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CompanyDeal[];
    },
    enabled: !!id,
  });

  const { data: signals = [] } = useQuery({
    queryKey: ['account-signals', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('account_signals')
        .select('*')
        .eq('company_id', id!)
        .order('detected_at', { ascending: false });
      return (data || []) as CompanySignal[];
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`company-score-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'companies',
          filter: `id=eq.${id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ['company', id] });
          qc.invalidateQueries({ queryKey: ['companies'] });
          qc.invalidateQueries({ queryKey: ['account-stats'] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, qc]);

  if (isLoading) {
    return (
      <DashboardLayout>
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-32 w-full" />
      </DashboardLayout>
    );
  }

  if (!company) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">Conta não encontrada.</p>
      </DashboardLayout>
    );
  }

  const signal = company.buying_signal || 'cold';
  const signalCfg = SIGNAL_CFG[signal];
  const SignalIcon = signalCfg.icon;

  function handleAddLaunch() {
    setEditingLaunch(null);
    setLaunchFormOpen(true);
  }

  function handleEditLaunch(launch: CompanyLaunch) {
    setEditingLaunch(launch);
    setLaunchFormOpen(true);
  }

  function handleLaunchFormOpenChange(open: boolean) {
    setLaunchFormOpen(open);
    if (!open) setEditingLaunch(null);
  }

  return (
    <DashboardLayout>
      <PageTransition>
      <Breadcrumbs items={[
        { label: 'CRM' },
        { label: 'Empresas', href: '/crm/empresas' },
        { label: company.name },
      ]} />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-lg font-bold text-primary">{company.name.slice(0, 2).toUpperCase()}</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold">{company.name}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`flex items-center gap-1 text-sm font-medium ${signalCfg.style}`}>
                <SignalIcon className="h-4 w-4" /> {signalCfg.label}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-sm text-muted-foreground">{company.segment || 'Incorporadora'}</span>
              {company.city && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-sm text-muted-foreground">{company.city}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => setNoteDraftOpen((v) => !v)}
          >
            <StickyNote className="h-3.5 w-3.5" /> Nota
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => setCallOpen(true)}
          >
            <Phone className="h-3.5 w-3.5" /> Call
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => setTaskOpen(true)}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Task
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => setContactFormOpen(true)}
          >
            <Users className="h-3.5 w-3.5" /> Contato
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => setDealFormOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" /> Deal
          </Button>
          <Can admin>
            <Button variant="outline" size="sm" className="gap-1" onClick={() => setSignalManagerOpen(true)}>
              <Zap className="h-3.5 w-3.5" /> Sinais
            </Button>
          </Can>
          {company.website && (
            <a href={company.website} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="gap-1">
                <Globe className="h-3.5 w-3.5" /> Site
              </Button>
            </a>
          )}
          {company.linkedin_url && (
            <a href={company.linkedin_url} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="gap-1">
                <Linkedin className="h-3.5 w-3.5" /> LinkedIn
              </Button>
            </a>
          )}
        </div>
      </div>

      {/* Note drawer (inline) */}
      {noteDraftOpen && (
        <Card className="mb-6">
          <CardContent className="space-y-2 p-3">
            <Textarea
              autoFocus
              rows={3}
              placeholder="Escreva uma nota sobre esta conta…"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setNoteDraft(''); setNoteDraftOpen(false); }}
                disabled={noteMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={() => noteMutation.mutate(noteDraft)}
                disabled={noteMutation.isPending || !noteDraft.trim()}
              >
                {noteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Salvar nota'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'VGV Projetado', value: fmtVGV(company.vgv_projected), icon: TrendingUp },
          { label: 'Score', value: `${company.score_tier || 'C'} · ${company.icp_score || 0}/100`, icon: BarChart3 },
          { label: 'Lançamentos', value: `${launches.length}`, icon: Rocket },
          { label: 'Contatos', value: `${contacts.length}`, icon: Users },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="p-4 flex items-center gap-3">
              <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <p className="font-bold">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
        <aside className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Pessoas-chave</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">Conta primeiro, pessoas logo abaixo.</p>
                </div>
                <Can admin>
                  <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setContactFormOpen(true)}>
                    <Plus className="h-4 w-4" /> Adicionar contato
                  </Button>
                </Can>
              </div>
            </CardHeader>
            <CardContent>
              {contacts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhuma pessoa-chave encontrada.</p>
                  <p className="text-xs mt-1">Adicione diretor comercial, CMO, CEO ou sócio.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {contacts.map(c => (
                    <SidebarContactRow
                      key={c.id}
                      contact={c}
                      onOpen={(contactId) => navigate(`/crm/contatos/${contactId}`)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Deals da conta</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">Negócios vinculados por empresa.</p>
                </div>
                <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setDealFormOpen(true)}>
                  <Plus className="h-4 w-4" /> Deal
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {deals.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum deal vinculado.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {deals.map((deal) => (
                    <SidebarDealRow
                      key={deal.id}
                      deal={deal}
                      onOpen={(dealId) => navigate(`/crm/negocios/${dealId}`)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </aside>

        <main className="min-w-0 space-y-6">
          <Card>
            <CardContent className="p-3">
              <Tabs defaultValue="timeline" className="w-full">
                <TabsList className="mb-3 flex h-auto flex-wrap justify-start">
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                  <TabsTrigger value="launches">Lançamentos</TabsTrigger>
                  <TabsTrigger value="signals">Sinais</TabsTrigger>
                  <TabsTrigger value="cadence">Cadência</TabsTrigger>
                  <TabsTrigger value="whatsapp">Conversa WhatsApp</TabsTrigger>
                  <TabsTrigger value="interactions">Atividades</TabsTrigger>
                </TabsList>

                <TabsContent value="timeline" className="mt-0">
                  <ActivityTimeline
                    companyId={company.id}
                    emptyHint="Quando um contato dessa conta responder no WhatsApp ou você adicionar uma nota, aparece aqui."
                    onAddNote={() => setNoteDraftOpen(true)}
                  />
                </TabsContent>

                <TabsContent value="launches" className="mt-0">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-base font-semibold">Lançamentos</h2>
                        <p className="text-sm text-muted-foreground">Visão direta dos empreendimentos da conta.</p>
                      </div>
                      <Can admin>
                        <Button type="button" size="sm" className="gap-1.5" onClick={handleAddLaunch}>
                          <Plus className="h-4 w-4" /> Adicionar lançamento
                        </Button>
                      </Can>
                    </div>

                    {launches.length === 0 ? (
                      <Card>
                        <CardContent className="py-10 text-center text-muted-foreground">
                          <Rocket className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          <p className="text-sm">Nenhum lançamento cadastrado.</p>
                        </CardContent>
                      </Card>
                    ) : (
                      launches.map((launch) => (
                        <LaunchCard
                          key={launch.id}
                          launch={launch}
                          onEdit={handleEditLaunch}
                          canEdit={isAdmin}
                        />
                      ))
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="signals" className="mt-0">
                  <SignalsTab
                    signals={signals}
                    onManage={() => setSignalManagerOpen(true)}
                    canManage={isAdmin}
                  />
                </TabsContent>

                <TabsContent value="cadence" className="mt-0">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Cadência</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CadenceTimeline company={company} contacts={contacts} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="whatsapp" className="mt-0">
                  <WhatsAppTimeline
                    companyId={company.id}
                    compact
                    storageKey={`whatsapp-company-${company.id}`}
                    title="WhatsApp"
                    description="Historico capturado pela extensao, com mensagens, audio e transcricao quando existir."
                  />
                </TabsContent>

                <TabsContent value="interactions" className="mt-0">
                  <InteractionFeed companyId={company.id} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </main>

        <aside className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Propriedades</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <CompanyProperty label="Responsável" value={company.owner?.name ?? '—'} />
              <InlineEdit
                label="Status"
                value={company.status ?? null}
                variant="select"
                options={COMPANY_STATUS_OPTIONS}
                nullable={false}
                onSave={(value) => saveCompanyProperty('status', company.status ?? null, value)}
              />
              <InlineEdit
                label="Sinal"
                value={company.buying_signal}
                displayValue={signalCfg.label}
                variant="select"
                options={BUYING_SIGNAL_OPTIONS}
                nullable={false}
                onSave={(value) => saveCompanyProperty('buying_signal', company.buying_signal, value)}
              />
              <CompanyProperty label="Score" value={`${company.score_tier || 'C'} · ${company.icp_score || 0}/100`} />
              <InlineEdit
                label="Domínio"
                value={company.domain ?? null}
                onSave={(value) => saveCompanyProperty('domain', company.domain ?? null, value)}
              />
              <InlineEdit
                label="CNPJ"
                value={company.cnpj ?? null}
                onSave={(value) => saveCompanyProperty('cnpj', company.cnpj ?? null, value)}
              />
              <InlineEdit
                label="Cidade"
                value={company.city ?? null}
                onSave={(value) => saveCompanyProperty('city', company.city ?? null, value)}
              />
              <InlineEdit
                label="Estado"
                value={company.state ?? null}
                onSave={(value) => saveCompanyProperty('state', company.state ?? null, value)}
              />
              <InlineEdit
                label="Segmento"
                value={company.segment ?? null}
                onSave={(value) => saveCompanyProperty('segment', company.segment ?? null, value)}
              />
              <InlineEdit
                label="Modelo comercial"
                value={company.sales_model ?? null}
                variant="select"
                options={SALES_MODEL_OPTIONS}
                onSave={(value) => saveCompanyProperty('sales_model', company.sales_model ?? null, value)}
              />
              <InlineEdit
                label="VGV projetado"
                value={company.vgv_projected ?? null}
                displayValue={fmtVGV(company.vgv_projected)}
                variant="number"
                onSave={(value) => saveCompanyProperty('vgv_projected', company.vgv_projected ?? null, value)}
              />
              <InlineEdit
                label="Mídia mensal"
                value={company.monthly_media_spend ?? null}
                displayValue={fmtVGV(company.monthly_media_spend)}
                variant="number"
                onSave={(value) => saveCompanyProperty('monthly_media_spend', company.monthly_media_spend ?? null, value)}
              />
              <InlineEdit
                label="Cadência"
                value={company.cadence_status ?? null}
                nullable={false}
                onSave={(value) => saveCompanyProperty('cadence_status', company.cadence_status ?? null, value)}
              />
              <CompanyProperty label="Sinais" value={String(signals.length)} />
              <CompanyProperty label="Criada em" value={fmtDate(company.created_at)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {company.website && (
                <a href={company.website} target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm" className="w-full justify-start gap-1.5">
                    <Globe className="h-4 w-4" /> Site
                  </Button>
                </a>
              )}
              {company.linkedin_url && (
                <a href={company.linkedin_url} target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm" className="w-full justify-start gap-1.5">
                    <Linkedin className="h-4 w-4" /> LinkedIn
                  </Button>
                </a>
              )}
              {company.instagram_url && (
                <a href={company.instagram_url} target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm" className="w-full justify-start gap-1.5">
                    <Instagram className="h-4 w-4" /> Instagram
                  </Button>
                </a>
              )}
              <Can admin>
                <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => setSignalManagerOpen(true)}>
                  <Zap className="h-4 w-4" /> Gerenciar sinais
                </Button>
              </Can>
            </CardContent>
          </Card>

          <Can admin>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Automações</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Teste o pipeline automático desta conta: evento bruto → interação → sinal/tarefa → atualização do CRM.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5"
                  onClick={() => simulateReplyMutation.mutate()}
                  disabled={simulateReplyMutation.isPending}
                >
                  <Play className="h-4 w-4" />
                  {simulateReplyMutation.isPending ? 'Processando reply…' : 'Simular reply no WhatsApp'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5"
                  onClick={() => simulateSignalMutation.mutate()}
                  disabled={simulateSignalMutation.isPending}
                >
                  <Zap className="h-4 w-4" />
                  {simulateSignalMutation.isPending ? 'Processando sinal…' : 'Simular sinal de mercado'}
                </Button>
              </CardContent>
            </Card>
          </Can>
        </aside>
      </div>

      {isAdmin && (
        <LaunchForm
          open={launchFormOpen}
          onOpenChange={handleLaunchFormOpenChange}
          companyId={company.id}
          launch={editingLaunch}
        />
      )}
      {isAdmin && (
        <SignalManager
          open={signalManagerOpen}
          onOpenChange={setSignalManagerOpen}
          companyId={company.id}
        />
      )}
      <ContactForm
        open={contactFormOpen}
        onOpenChange={setContactFormOpen}
        defaultCompanyId={company.id}
      />
      <DealForm
        open={dealFormOpen}
        onOpenChange={setDealFormOpen}
        defaultCompanyId={company.id}
      />

      <LogCallModal
        open={callOpen}
        onOpenChange={setCallOpen}
        companyId={company.id}
        createdBy={actorId}
        invalidateKey={['activities', 'company', company.id]}
      />

      <CreateTaskModal
        open={taskOpen}
        onOpenChange={setTaskOpen}
        companyId={company.id}
        createdBy={actorId}
        invalidateKey={['activities', 'company', company.id]}
      />
      </PageTransition>
    </DashboardLayout>
  );
}
