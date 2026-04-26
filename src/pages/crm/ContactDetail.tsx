import { useEffect, useMemo, useState, type ElementType, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  MessageCircle,
  Linkedin,
  Sparkles,
  Pencil,
  ExternalLink,
  User,
  Calendar,
  Briefcase,
  Loader2,
  AlertCircle,
  X,
  RotateCcw,
  StickyNote,
  PhoneCall,
  CheckSquare,
  Handshake,
  Users,
  Send,
  Clock3,
  DollarSign,
  AtSign,
} from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { PageTransition } from '@/components/PageTransition';
import { ContactForm } from '@/components/crm/ContactForm';
import { InlineEdit, type InlineEditValue } from '@/components/crm/InlineEdit';
import { ActivityTimeline } from '@/components/activities/ActivityTimeline';
import { LogCallModal } from '@/components/activities/LogCallModal';
import { CreateTaskModal } from '@/components/activities/CreateTaskModal';
import { DealForm } from '@/components/crm/DealForm';
import { ConversationView, type ConversationMessage } from '@/components/whatsapp/ConversationView';
import { Can } from '@/components/Can';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { getContact, getContactRelations } from '@/services/crmService';
import {
  createNoteActivity,
  getActivitiesForContact,
  updateContactProperty,
  type Activity,
} from '@/services/activitiesService';
import { revealContactPhone } from '@/services/apolloService';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CONTACT_SOURCES, type Contact } from '@/types';

const WATERFALL_TIMEOUT_MS = 90 * 1000;

function toWhatsAppHref(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}`;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

const SENIORITY_LABEL: Record<string, string> = {
  owner: 'Sócio / Dono',
  founder: 'Founder',
  c_suite: 'C-Level',
  vp: 'VP',
  head: 'Head',
  director: 'Diretor',
  manager: 'Gerente',
  senior: 'Sênior',
  entry: 'Pleno/Júnior',
  intern: 'Estagiário',
};

const LIFECYCLE_LABEL: Record<string, string> = {
  subscriber: 'Subscriber',
  lead: 'Lead',
  mql: 'MQL',
  sql: 'SQL',
  opportunity: 'Oportunidade',
  customer: 'Cliente',
  evangelist: 'Evangelista',
  disqualified: 'Desqualificado',
};

const LIFECYCLE_OPTIONS = Object.entries(LIFECYCLE_LABEL).map(([value, label]) => ({ value, label }));
const CONTACT_SOURCE_OPTIONS = CONTACT_SOURCES.map((source) => ({ value: source, label: source }));
const SENIORITY_OPTIONS = Object.entries(SENIORITY_LABEL).map(([value, label]) => ({ value, label }));

const SIGNAL_LABEL: Record<string, string> = {
  hot: 'Quente',
  warm: 'Morno',
  cold: 'Frio',
};

function formatDate(value: string | null | undefined, pattern = 'dd/MM/yyyy') {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, pattern, { locale: ptBR });
}

function formatCurrency(value: number | null | undefined) {
  if (value == null) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value);
}

function payloadString(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

function payloadNumber(payload: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

function activityToConversationMessage(activity: Activity, contact: Contact): ConversationMessage {
  const payload = activity.payload ?? {};
  const type = payloadString(payload, ['message_type', 'media_type', 'type']) ?? 'text';
  const mediaUrl = payloadString(payload, ['media_url', 'audio_url']);

  return {
    id: activity.id,
    direction: activity.direction === 'out' ? 'outbound' : 'inbound',
    messageType: type,
    body: activity.body ?? payloadString(payload, ['body', 'text', 'caption']) ?? '',
    occurredAt: activity.occurredAt ?? null,
    senderName: activity.direction === 'out'
      ? null
      : payloadString(payload, ['sender_name', 'author_name', 'from_name']) ?? contact.name,
    author: activity.author.name,
    mediaUrl,
    audioUrl: type === 'audio' || type === 'ptt' || type === 'voice' ? mediaUrl : null,
    mediaMime: payloadString(payload, ['media_mime', 'mime', 'mimetype']),
    mediaName: payloadString(payload, ['media_name', 'filename', 'file_name']),
    mediaSize: payloadNumber(payload, ['media_size', 'size']),
    ingestionStatus: 'saved',
    ingestionError: payloadString(payload, ['ingestion_error', 'error']),
    transcript: payloadString(payload, ['transcript', 'audio_transcript']),
  };
}

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { profile, session } = useAuth();
  const actorId = profile?.id ?? session?.user?.id ?? null;
  const [editOpen, setEditOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteBody, setNoteBody] = useState('');
  const [callOpen, setCallOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [dealOpen, setDealOpen] = useState(false);
  const [waterfallUntil, setWaterfallUntil] = useState<number | null>(null);
  const [waterfallStartedAt, setWaterfallStartedAt] = useState<number | null>(null);
  const [waterfallResult, setWaterfallResult] = useState<'not_found' | null>(null);
  const [now, setNow] = useState(Date.now());

  const { data: contact, isLoading, refetch } = useQuery({
    queryKey: ['contact', id],
    queryFn: () => getContact(id!),
    enabled: !!id,
  });

  const { data: relations, isLoading: relationsLoading } = useQuery({
    queryKey: ['contact-relations', id, contact?.company_id ?? null],
    queryFn: () => getContactRelations(id!, contact?.company_id ?? null),
    enabled: !!id && !!contact,
  });

  const { data: whatsappActivities = [], isLoading: whatsappLoading } = useQuery({
    queryKey: ['contact-whatsapp-conversation', id],
    queryFn: () => getActivitiesForContact(id!, { kinds: ['whatsapp'], limit: 500 }),
    enabled: !!id && !!contact,
    refetchInterval: 30_000,
  });

  const revealPhoneMutation = useMutation({
    mutationFn: () => revealContactPhone(id!),
    onSuccess: (res) => {
      if (res.phone) {
        toast.success(`Telefone encontrado: ${res.phone}`);
        qc.invalidateQueries({ queryKey: ['contact', id] });
        qc.invalidateQueries({ queryKey: ['contacts'] });
      } else if (res.waterfall_pending) {
        const start = Date.now();
        setWaterfallStartedAt(start);
        setWaterfallUntil(start + WATERFALL_TIMEOUT_MS);
        setWaterfallResult(null);
      } else {
        toast.warning(res.message);
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createNoteMutation = useMutation({
    mutationFn: (body: string) => createNoteActivity({
      contactId: id!,
      companyId: contact?.company_id ?? null,
      body,
      createdBy: actorId,
    }),
    onSuccess: () => {
      toast.success('Nota adicionada.');
      setNoteBody('');
      setNoteOpen(false);
      qc.invalidateQueries({ queryKey: ['activities', 'contact', id] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const saveContactProperty = async (
    field: string,
    oldValue: string | number | null | undefined,
    newValue: InlineEditValue,
  ) => {
    if (!contact) throw new Error('Contato nao carregado.');
    await updateContactProperty({
      id: contact.id,
      field,
      oldValue,
      newValue,
      createdBy: actorId,
      scope: {
        contactId: contact.id,
        companyId: contact.company_id ?? null,
      },
    });
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['contact', id] }),
      qc.invalidateQueries({ queryKey: ['contacts'] }),
      qc.invalidateQueries({ queryKey: ['activities', 'contact', id] }),
      refetch(),
    ]);
  };

  useEffect(() => {
    if (!waterfallUntil) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [waterfallUntil]);

  useEffect(() => {
    if (waterfallUntil && now >= waterfallUntil) {
      setWaterfallUntil(null);
      setWaterfallStartedAt(null);
      setWaterfallResult('not_found');
    }
  }, [now, waterfallUntil]);

  useEffect(() => {
    if (!waterfallUntil || !id) return;
    const ch = supabase
      .channel(`contact-${id}-waterfall`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'contacts', filter: `id=eq.${id}` },
        (payload) => {
          const n = payload.new as { phone?: string | null; whatsapp?: string | null; email?: string | null };
          if (n.phone || n.whatsapp || n.email) {
            toast.success('Dados do contato atualizados via waterfall!');
            setWaterfallUntil(null);
            setWaterfallStartedAt(null);
            setWaterfallResult(null);
            qc.invalidateQueries({ queryKey: ['contact', id] });
            qc.invalidateQueries({ queryKey: ['contacts'] });
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [waterfallUntil, id, qc]);

  const waitingSeconds = waterfallUntil ? Math.max(0, Math.ceil((waterfallUntil - now) / 1000)) : 0;
  const waitingLabel = waterfallUntil
    ? `${Math.floor(waitingSeconds / 60)}:${String(waitingSeconds % 60).padStart(2, '0')}`
    : null;
  const waitingProgress = waterfallUntil && waterfallStartedAt
    ? Math.min(100, Math.max(0, 100 * ((now - waterfallStartedAt) / WATERFALL_TIMEOUT_MS)))
    : 0;

  const whatsappMessages = useMemo(() => {
    if (!contact) return [];
    return [...whatsappActivities]
      .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())
      .map((activity) => activityToConversationMessage(activity, contact));
  }, [contact, whatsappActivities]);

  if (isLoading) {
    return (
      <DashboardLayout>
        <Skeleton className="mb-4 h-8 w-24" />

        <div className="mb-6 flex flex-col gap-4 rounded-xl border bg-card p-5 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-1 items-start gap-4">
            <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-7 w-56" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <Skeleton className="h-8 w-20" />
        </div>

        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-28" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (!contact) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <User className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <h1 className="text-lg font-semibold">Contato não encontrado</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pode ter sido removido.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/crm/contatos')}>
            Voltar para contatos
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const waHref = contact.whatsapp ? toWhatsAppHref(contact.whatsapp) : null;
  const phoneHref = contact.phone ? toWhatsAppHref(contact.phone) : null;
  const canEnrich = !!(contact.apollo_person_id || contact.linkedin_url || contact.email);
  const lifecycle = contact.lifecycle_stage
    ? LIFECYCLE_LABEL[contact.lifecycle_stage] ?? contact.lifecycle_stage
    : 'Lead';
  const primaryPhone = contact.whatsapp ?? contact.phone;

  function handleSubmitNote(event: FormEvent) {
    event.preventDefault();
    const body = noteBody.trim();
    if (!body) {
      toast.warning('Escreva uma nota antes de salvar.');
      return;
    }
    createNoteMutation.mutate(body);
  }

  function handleSendWhatsApp() {
    const href = primaryPhone ? toWhatsAppHref(primaryPhone) : null;
    if (!href) {
      toast.warning('Este contato ainda não tem WhatsApp ou telefone.');
      return;
    }
    window.open(href, '_blank', 'noopener,noreferrer');
  }

  return (
    <DashboardLayout>
      <PageTransition>
      <Breadcrumbs items={[
        { label: 'CRM' },
        { label: 'Contatos', href: '/crm/contatos' },
        { label: contact.name },
      ]} />

      <div className="mb-4 flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
            {initials(contact.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-bold">{contact.name}</h1>
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                {lifecycle}
              </Badge>
              {contact.enrichment_source && (
                <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
                  <Sparkles className="h-3 w-3" />
                  {contact.enrichment_source === 'apollo' ? 'Apollo' :
                   contact.enrichment_source === 'apollo_waterfall' ? 'Apollo + waterfall' :
                   contact.enrichment_source}
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {contact.role || 'Cargo não informado'}
              {contact.seniority && (
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">
                  {SENIORITY_LABEL[contact.seniority] ?? contact.seniority}
                </span>
              )}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
              {contact.company && (
                <button
                  type="button"
                  onClick={() => navigate(`/crm/empresas/${contact.company!.id}`)}
                  className="inline-flex items-center gap-1.5 hover:text-primary hover:underline"
                >
                  <Building2 className="h-3.5 w-3.5" />
                  {contact.company.name}
                  <ExternalLink className="h-3 w-3" />
                </button>
              )}
              {contact.owner?.name && (
                <span className="inline-flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  {contact.owner.name}
                </span>
              )}
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1.5 hover:text-primary hover:underline">
                  <Mail className="h-3.5 w-3.5" />
                  {contact.email}
                </a>
              )}
              {primaryPhone && (
                <button
                  type="button"
                  onClick={handleSendWhatsApp}
                  className="inline-flex items-center gap-1.5 hover:text-primary hover:underline"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  {primaryPhone}
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <Button size="sm" onClick={() => setNoteOpen((open) => !open)} className="gap-1.5">
            <StickyNote className="h-3.5 w-3.5" /> Add note
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCallOpen(true)} className="gap-1.5">
            <PhoneCall className="h-3.5 w-3.5" /> Call
          </Button>
          <Button size="sm" variant="outline" onClick={() => setTaskOpen(true)} className="gap-1.5">
            <CheckSquare className="h-3.5 w-3.5" /> Task
          </Button>
          <Button size="sm" variant="outline" onClick={handleSendWhatsApp} className="gap-1.5">
            <Send className="h-3.5 w-3.5" /> WhatsApp
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDealOpen(true)} className="gap-1.5">
            <Handshake className="h-3.5 w-3.5" /> Deal
          </Button>
          <Can admin>
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" /> Editar
            </Button>
          </Can>
        </div>
      </div>

      {waterfallUntil && (
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                Enriquecendo contato via Apollo waterfall…
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Datagma / Cognism buscando telefone e e-mail. Isso costuma levar até 60s.
              </p>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-primary/10">
                <div
                  className="h-full bg-primary transition-[width] duration-1000 ease-linear"
                  style={{ width: `${waitingProgress}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs font-medium tabular-nums text-primary">
                {waitingLabel} restantes
              </p>
            </div>
          </div>
        </div>
      )}

      {waterfallResult === 'not_found' && !waterfallUntil && (
        <div className="mb-4 rounded-lg border border-amber-300/60 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Não encontramos dados adicionais
              </p>
              <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-300/80">
                Datagma/Cognism não retornaram telefone ou e-mail para este contato.
                Você pode tentar novamente mais tarde — as bases são atualizadas com frequência.
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setWaterfallResult(null);
                    revealPhoneMutation.mutate();
                  }}
                  disabled={revealPhoneMutation.isPending}
                  className="h-7 gap-1.5 border-amber-400 bg-white text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-transparent dark:text-amber-200"
                >
                  <RotateCcw className="h-3 w-3" /> Tentar novamente
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setWaterfallResult(null)}
                  className="h-7 gap-1.5 text-amber-800 hover:bg-amber-100 dark:text-amber-300"
                >
                  <X className="h-3 w-3" /> Fechar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-primary" /> Empresa
              </CardTitle>
            </CardHeader>
            <CardContent>
              {relationsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-5 w-36" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-28" />
                </div>
              ) : relations?.company || contact.company ? (
                <div className="space-y-3 text-sm">
                  <button
                    type="button"
                    onClick={() => contact.company_id && navigate(`/crm/empresas/${contact.company_id}`)}
                    className="text-left font-semibold leading-tight hover:text-primary hover:underline"
                  >
                    {relations?.company?.name ?? contact.company?.name}
                  </button>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <SummaryPill label="Sinal" value={relations?.company?.buying_signal ? SIGNAL_LABEL[relations.company.buying_signal] ?? relations.company.buying_signal : '—'} />
                    <SummaryPill label="Status" value={relations?.company?.status ?? '—'} />
                    <SummaryPill label="Cidade" value={relations?.company?.city ?? '—'} />
                    <SummaryPill label="Segmento" value={relations?.company?.segment ?? '—'} />
                  </div>
                </div>
              ) : (
                <EmptySideHint text="Sem empresa vinculada." />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <DollarSign className="h-4 w-4 text-primary" /> Deals
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {relationsLoading ? (
                Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
              ) : relations?.deals.length ? (
                relations.deals.map((deal) => (
                  <div key={deal.id} className="rounded-lg border bg-background px-3 py-2">
                    <p className="line-clamp-2 text-sm font-medium">{deal.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{deal.stage_name}</span>
                      <span>{formatCurrency(deal.value)}</span>
                      {deal.expected_close && (
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="h-3 w-3" />
                          {formatDate(deal.expected_close)}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <EmptySideHint text="Nenhum deal ligado a este contato." />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-primary" /> Contatos da empresa
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {relationsLoading ? (
                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)
              ) : relations?.siblings.length ? (
                relations.siblings.map((sibling) => (
                  <button
                    key={sibling.id}
                    type="button"
                    onClick={() => navigate(`/crm/contatos/${sibling.id}`)}
                    className="block w-full rounded-lg border bg-background px-3 py-2 text-left transition hover:border-primary/40 hover:bg-primary/5"
                  >
                    <p className="truncate text-sm font-medium">{sibling.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{sibling.role || sibling.email || sibling.whatsapp || 'Sem detalhes'}</p>
                  </button>
                ))
              ) : (
                <EmptySideHint text="Nenhum outro contato nessa empresa." />
              )}
            </CardContent>
          </Card>
        </aside>

        <section className="min-w-0">
          <Card className="min-h-[640px]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-4 w-4 text-primary" /> Histórico do contato
              </CardTitle>
            </CardHeader>
            <CardContent>
              {noteOpen && (
                <form onSubmit={handleSubmitNote} className="mb-4 rounded-lg border bg-muted/30 p-3">
                  <Textarea
                    value={noteBody}
                    onChange={(event) => setNoteBody(event.target.value)}
                    placeholder="Escreva uma nota sobre este contato..."
                    className="min-h-[96px] bg-background"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setNoteOpen(false);
                        setNoteBody('');
                      }}
                      disabled={createNoteMutation.isPending}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" size="sm" disabled={createNoteMutation.isPending}>
                      {createNoteMutation.isPending ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          Salvando
                        </>
                      ) : (
                        'Salvar nota'
                      )}
                    </Button>
                  </div>
                </form>
              )}

              <Tabs defaultValue="timeline" className="w-full">
                <TabsList className="mb-3">
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                  <TabsTrigger value="whatsapp">Conversa WhatsApp</TabsTrigger>
                </TabsList>
                <TabsContent value="timeline" className="mt-0">
                  <ActivityTimeline
                    contactId={id!}
                    emptyHint="Nenhuma atividade neste contato ainda."
                    pollMs={30_000}
                  />
                </TabsContent>
                <TabsContent value="whatsapp" className="mt-0">
                  {whatsappLoading ? (
                    <div className="flex min-h-[360px] items-center justify-center text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : whatsappMessages.length ? (
                    <div className="max-h-[680px] overflow-y-auto rounded-lg border bg-[#efe7dd] dark:bg-[#0b141a]">
                      <ConversationView
                        messages={whatsappMessages}
                        inboundLabel={contact.name}
                        outboundLabel="Pipa Driven"
                      />
                    </div>
                  ) : (
                    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border bg-muted/20 text-center text-muted-foreground">
                      <MessageCircle className="mb-2 h-10 w-10 opacity-25" />
                      <p className="text-sm">Nenhuma conversa de WhatsApp sincronizada para este contato.</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </section>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Phone className="h-4 w-4 text-primary" /> Canais
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ContactRow
                icon={Mail}
                label="E-mail"
                value={contact.email}
                href={contact.email ? `mailto:${contact.email}` : null}
                canEnrich={canEnrich}
                enriching={revealPhoneMutation.isPending}
                onEnrich={() => revealPhoneMutation.mutate()}
                waitingLabel={waitingLabel}
              />
              <ContactRow
                icon={MessageCircle}
                label="WhatsApp"
                value={primaryPhone}
                href={waHref ?? phoneHref}
                hrefLabel="Abrir conversa"
                canEnrich={canEnrich}
                enriching={revealPhoneMutation.isPending}
                onEnrich={() => revealPhoneMutation.mutate()}
                waitingLabel={waitingLabel}
              />
              <ContactRow
                icon={Linkedin}
                label="LinkedIn"
                value={contact.linkedin_url}
                href={contact.linkedin_url}
                hrefLabel="Abrir perfil"
                external
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Briefcase className="h-4 w-4 text-primary" /> Propriedades
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InlineEdit
                label="Nome"
                value={contact.name}
                nullable={false}
                onSave={(value) => saveContactProperty('name', contact.name, value)}
              />
              <InlineEdit
                label="Lifecycle"
                value={contact.lifecycle_stage ?? null}
                displayValue={lifecycle}
                variant="select"
                options={LIFECYCLE_OPTIONS}
                nullable={false}
                onSave={(value) => saveContactProperty('lifecycle_stage', contact.lifecycle_stage ?? null, value)}
              />
              <MetaRow label="Empresa" value={contact.company?.name ?? '—'} icon={Building2} />
              <InlineEdit
                label="Cargo"
                value={contact.role ?? null}
                onSave={(value) => saveContactProperty('role', contact.role ?? null, value)}
              />
              <InlineEdit
                label="Senioridade"
                value={contact.seniority ?? null}
                displayValue={contact.seniority ? (SENIORITY_LABEL[contact.seniority] ?? contact.seniority) : '—'}
                variant="select"
                options={SENIORITY_OPTIONS}
                onSave={(value) => saveContactProperty('seniority', contact.seniority ?? null, value)}
              />
              <MetaRow label="Departamentos" value={contact.departments?.length ? contact.departments.join(', ') : '—'} />
              <MetaRow label="Responsável" value={contact.owner?.name ?? '—'} icon={User} />
              <InlineEdit
                label="Origem"
                value={contact.source ?? null}
                variant="select"
                options={CONTACT_SOURCE_OPTIONS}
                onSave={(value) => saveContactProperty('source', contact.source ?? null, value)}
              />
              <InlineEdit
                label="E-mail"
                value={contact.email ?? null}
                onSave={(value) => saveContactProperty('email', contact.email ?? null, value)}
              />
              <InlineEdit
                label="WhatsApp"
                value={contact.whatsapp ?? null}
                onSave={(value) => saveContactProperty('whatsapp', contact.whatsapp ?? null, value)}
              />
              <InlineEdit
                label="Telefone"
                value={contact.phone ?? null}
                onSave={(value) => saveContactProperty('phone', contact.phone ?? null, value)}
              />
              <MetaRow label="Criado em" value={formatDate(contact.created_at)} icon={Calendar} />
              {contact.enriched_at && (
                <MetaRow
                  label="Enriquecido"
                  icon={Sparkles}
                  value={formatDate(contact.enriched_at, "dd/MM/yyyy 'às' HH:mm")}
                />
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      <ContactForm
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) refetch();
        }}
        contact={contact}
      />

      <LogCallModal
        open={callOpen}
        onOpenChange={setCallOpen}
        contactId={contact.id}
        companyId={contact.company?.id ?? null}
        createdBy={actorId}
        invalidateKey={['activities', 'contact', contact.id]}
      />

      <CreateTaskModal
        open={taskOpen}
        onOpenChange={setTaskOpen}
        contactId={contact.id}
        companyId={contact.company?.id ?? null}
        createdBy={actorId}
        invalidateKey={['activities', 'contact', contact.id]}
      />

      <DealForm
        open={dealOpen}
        onOpenChange={setDealOpen}
        defaultCompanyId={contact.company?.id ?? ''}
      />
      </PageTransition>
    </DashboardLayout>
  );
}

function ContactRow({
  icon: Icon,
  label,
  value,
  href,
  hrefLabel = 'Abrir',
  external,
  canEnrich,
  enriching,
  onEnrich,
  waitingLabel,
}: {
  icon: ElementType;
  label: string;
  value: string | null | undefined;
  href?: string | null;
  hrefLabel?: string;
  external?: boolean;
  canEnrich?: boolean;
  enriching?: boolean;
  onEnrich?: () => void;
  waitingLabel?: string | null;
}) {
  const hasValue = !!value;
  const isWaiting = !hasValue && !!waitingLabel;
  const showEnrichButton = !hasValue && canEnrich && !!onEnrich && !isWaiting;
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-background px-3 py-2.5">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${hasValue ? 'text-primary' : 'text-muted-foreground/40'}`} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`truncate text-sm ${hasValue ? 'font-medium' : 'text-muted-foreground'}`}>
          {value ?? (isWaiting ? 'Buscando na waterfall…' : 'Não informado')}
        </p>
      </div>
      {hasValue && href && (
        <a
          href={href}
          target={external ? '_blank' : undefined}
          rel={external ? 'noreferrer' : undefined}
          className="shrink-0 text-xs text-primary hover:underline"
        >
          {hrefLabel}
        </a>
      )}
      {isWaiting && (
        <div
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
          title="Apollo waterfall em andamento"
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          <span className="tabular-nums">{waitingLabel}</span>
        </div>
      )}
      {showEnrichButton && (
        <button
          type="button"
          onClick={onEnrich}
          disabled={enriching}
          title="Enriquecer com Apollo"
          className="shrink-0 rounded-md p-1.5 text-primary transition hover:bg-primary/10 disabled:opacity-50"
        >
          {enriching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
        </button>
      )}
    </div>
  );
}

function MetaRow({ label, value, icon: Icon }: { label: string; value: string; icon?: ElementType }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </span>
      <span className="max-w-[58%] text-right text-sm font-medium">{value}</span>
    </div>
  );
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted px-2 py-1">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-xs font-semibold">{value}</p>
    </div>
  );
}

function EmptySideHint({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-center text-sm text-muted-foreground">
      {text}
    </p>
  );
}
