import { useMemo, useState, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Calendar,
  CheckSquare,
  DollarSign,
  ExternalLink,
  GitBranch,
  Loader2,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  StickyNote,
  User,
} from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { PageTransition } from '@/components/PageTransition';
import { ActivityTimeline } from '@/components/activities/ActivityTimeline';
import { LogCallModal } from '@/components/activities/LogCallModal';
import { CreateTaskModal } from '@/components/activities/CreateTaskModal';
import { DealForm } from '@/components/crm/DealForm';
import { InlineEdit, type InlineEditValue } from '@/components/crm/InlineEdit';
import { Can } from '@/components/Can';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import {
  createNoteActivity,
  createStageChangeActivity,
  updateDealProperty,
} from '@/services/activitiesService';
import { getDeal, updateDeal } from '@/services/crmService';
import { DEAL_STAGES, type Deal } from '@/types';

const STAGE_STYLE: Record<string, string> = {
  'Qualificação': 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  Proposta: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  Negociação: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  'Fechado - Ganho': 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  'Fechado - Perdido': 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

function formatCurrency(value: number | null | undefined) {
  if (value == null) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function toWhatsAppHref(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, '') ?? '';
  if (!digits) return null;
  return `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}`;
}

function stageClass(stage: string) {
  return STAGE_STYLE[stage] ?? 'bg-muted text-muted-foreground';
}

export default function DealDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { profile, session } = useAuth();
  const actorId = profile?.id ?? session?.user?.id ?? null;
  const [editOpen, setEditOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteBody, setNoteBody] = useState('');
  const [stageOpen, setStageOpen] = useState(false);
  const [stageDraft, setStageDraft] = useState('');
  const [callOpen, setCallOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  const { data: deal, isLoading, refetch } = useQuery({
    queryKey: ['deal', id],
    queryFn: () => getDeal(id!),
    enabled: !!id,
  });

  const stageOptions = useMemo(() => {
    const current = deal?.stage ? [deal.stage] : [];
    return Array.from(new Set([...current, ...DEAL_STAGES]));
  }, [deal?.stage]);

  const noteMutation = useMutation({
    mutationFn: (body: string) => createNoteActivity({
      dealId: id!,
      contactId: deal?.contact_id ?? null,
      companyId: deal?.company_id ?? null,
      body,
      createdBy: actorId,
    }),
    onSuccess: () => {
      toast.success('Nota adicionada.');
      setNoteBody('');
      setNoteOpen(false);
      qc.invalidateQueries({ queryKey: ['activities', 'deal', id] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const moveStageMutation = useMutation({
    mutationFn: async (toStage: string) => {
      if (!deal) throw new Error('Deal não carregado.');
      const fromStage = deal.stage;
      const updated = await updateDeal(deal.id, { stage: toStage });
      await createStageChangeActivity({
        dealId: deal.id,
        contactId: deal.contact_id,
        companyId: deal.company_id,
        dealTitle: deal.title,
        fromStage,
        toStage,
        createdBy: actorId,
      });
      return updated;
    },
    onSuccess: () => {
      toast.success('Stage atualizado.');
      setStageOpen(false);
      qc.invalidateQueries({ queryKey: ['deal', id] });
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['activities', 'deal', id] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const saveDealProperty = async (
    field: string,
    oldValue: string | number | null | undefined,
    newValue: InlineEditValue,
  ) => {
    if (!deal) throw new Error('Deal nao carregado.');
    await updateDealProperty({
      id: deal.id,
      field,
      oldValue,
      newValue,
      createdBy: actorId,
      scope: {
        dealId: deal.id,
        contactId: deal.contact_id,
        companyId: deal.company_id,
      },
    });
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['deal', id] }),
      qc.invalidateQueries({ queryKey: ['deals'] }),
      qc.invalidateQueries({ queryKey: ['activities', 'deal', id] }),
      refetch(),
    ]);
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <Skeleton className="mb-4 h-8 w-28" />
        <div className="mb-6 rounded-xl border bg-card p-5">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="mt-3 h-4 w-48" />
        </div>
        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  if (!deal) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Briefcase className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <h1 className="text-lg font-semibold">Deal não encontrado</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pode ter sido removido.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/crm/negocios')}>
            Voltar para negócios
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const whatsappHref = toWhatsAppHref(deal.contact?.whatsapp ?? deal.contact?.phone);

  function handleSubmitNote(event: FormEvent) {
    event.preventDefault();
    const body = noteBody.trim();
    if (!body) {
      toast.warning('Escreva uma nota antes de salvar.');
      return;
    }
    noteMutation.mutate(body);
  }

  function openMoveStage() {
    setStageDraft(deal.stage);
    setStageOpen((open) => !open);
  }

  return (
    <DashboardLayout>
      <PageTransition>
      <Breadcrumbs items={[
        { label: 'CRM' },
        { label: 'Pipeline', href: '/crm/negocios' },
        { label: deal.title },
      ]} />

      <div className="mb-4 flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Briefcase className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-bold">{deal.title}</h1>
              <Badge className={stageClass(deal.stage)}>{deal.stage}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" />
                {formatCurrency(deal.value)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(deal.expected_close)}
              </span>
              {deal.company && (
                <button
                  type="button"
                  onClick={() => navigate(`/crm/empresas/${deal.company!.id}`)}
                  className="inline-flex items-center gap-1.5 hover:text-primary hover:underline"
                >
                  <Building2 className="h-3.5 w-3.5" />
                  {deal.company.name}
                  <ExternalLink className="h-3 w-3" />
                </button>
              )}
              {deal.contact && (
                <button
                  type="button"
                  onClick={() => navigate(`/crm/contatos/${deal.contact!.id}`)}
                  className="inline-flex items-center gap-1.5 hover:text-primary hover:underline"
                >
                  <User className="h-3.5 w-3.5" />
                  {deal.contact.name}
                  <ExternalLink className="h-3 w-3" />
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
            <Phone className="h-3.5 w-3.5" /> Call
          </Button>
          <Button size="sm" variant="outline" onClick={() => setTaskOpen(true)} className="gap-1.5">
            <CheckSquare className="h-3.5 w-3.5" /> Task
          </Button>
          <Button size="sm" variant="outline" onClick={openMoveStage} className="gap-1.5">
            <GitBranch className="h-3.5 w-3.5" /> Move stage
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => whatsappHref ? window.open(whatsappHref, '_blank', 'noopener,noreferrer') : toast.warning('Contato sem WhatsApp ou telefone.')}
            className="gap-1.5"
          >
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </Button>
          <Can admin>
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" /> Editar
            </Button>
          </Can>
        </div>
      </div>

      {noteOpen && (
        <Card className="mb-4">
          <CardContent className="p-3">
            <form onSubmit={handleSubmitNote} className="space-y-2">
              <Textarea
                value={noteBody}
                onChange={(event) => setNoteBody(event.target.value)}
                placeholder="Escreva uma nota sobre este deal..."
                className="min-h-[96px]"
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setNoteOpen(false);
                    setNoteBody('');
                  }}
                  disabled={noteMutation.isPending}
                >
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={noteMutation.isPending}>
                  {noteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Salvar nota'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {stageOpen && (
        <Card className="mb-4">
          <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Novo estágio</p>
              <Select value={stageDraft || deal.stage} onValueChange={setStageDraft}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stageOptions.map((stage) => (
                    <SelectItem key={stage} value={stage}>{stage}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setStageOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => moveStageMutation.mutate(stageDraft || deal.stage)}
                disabled={moveStageMutation.isPending || (stageDraft || deal.stage) === deal.stage}
              >
                {moveStageMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Mover'}
              </Button>
            </div>
          </CardContent>
        </Card>
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
              {deal.company ? (
                <div className="space-y-3 text-sm">
                  <button
                    type="button"
                    onClick={() => navigate(`/crm/empresas/${deal.company!.id}`)}
                    className="text-left font-semibold hover:text-primary hover:underline"
                  >
                    {deal.company.name}
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <SidePill label="Sinal" value={deal.company.buying_signal ?? '—'} />
                    <SidePill label="Segmento" value={deal.company.segment ?? '—'} />
                    <SidePill label="Cidade" value={deal.company.city ?? '—'} />
                    <SidePill label="Funil" value={deal.funnel?.name ?? '—'} />
                  </div>
                </div>
              ) : (
                <EmptyHint text="Sem empresa vinculada." />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4 text-primary" /> Contato
              </CardTitle>
            </CardHeader>
            <CardContent>
              {deal.contact ? (
                <div className="space-y-3 text-sm">
                  <button
                    type="button"
                    onClick={() => navigate(`/crm/contatos/${deal.contact!.id}`)}
                    className="text-left font-semibold hover:text-primary hover:underline"
                  >
                    {deal.contact.name}
                  </button>
                  <p className="text-muted-foreground">{deal.contact.role || 'Cargo não informado'}</p>
                  <div className="flex flex-wrap gap-2">
                    {deal.contact.email && (
                      <a href={`mailto:${deal.contact.email}`}>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5">
                          <Mail className="h-3.5 w-3.5" /> E-mail
                        </Button>
                      </a>
                    )}
                    {whatsappHref && (
                      <a href={whatsappHref} target="_blank" rel="noreferrer">
                        <Button variant="outline" size="sm" className="h-8 gap-1.5">
                          <Phone className="h-3.5 w-3.5" /> WhatsApp
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <EmptyHint text="Sem contato vinculado." />
              )}
            </CardContent>
          </Card>
        </aside>

        <main className="min-w-0">
          <Card className="min-h-[640px]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-4 w-4 text-primary" /> Timeline do deal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline
                dealId={deal.id}
                emptyHint="Notas, mudanças de estágio e interações ligadas ao deal aparecem aqui."
                onAddNote={() => setNoteOpen(true)}
              />
            </CardContent>
          </Card>
        </main>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckSquare className="h-4 w-4 text-primary" /> Propriedades
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InlineEdit
                label="Título"
                value={deal.title}
                nullable={false}
                onSave={(value) => saveDealProperty('title', deal.title, value)}
              />
              <InlineEdit
                label="Stage"
                value={deal.stage}
                variant="select"
                options={stageOptions.map((stage) => ({ value: stage, label: stage }))}
                nullable={false}
                onSave={(value) => saveDealProperty('stage', deal.stage, value)}
              />
              <InlineEdit
                label="Valor"
                value={deal.value ?? null}
                displayValue={formatCurrency(deal.value)}
                variant="number"
                onSave={(value) => saveDealProperty('value', deal.value ?? null, value)}
              />
              <InlineEdit
                label="Fechamento previsto"
                value={deal.expected_close ? deal.expected_close.slice(0, 10) : null}
                displayValue={formatDate(deal.expected_close)}
                variant="date"
                onSave={(value) => saveDealProperty('expected_close', deal.expected_close ?? null, value)}
              />
              <PropertyRow label="Funil" value={deal.funnel?.name ?? '—'} />
              <PropertyRow label="Empresa" value={deal.company?.name ?? '—'} />
              <PropertyRow label="Contato" value={deal.contact?.name ?? '—'} />
              <PropertyRow label="Responsável" value={deal.owner?.name ?? '—'} />
              <PropertyRow label="Criado em" value={formatDate(deal.created_at)} />
            </CardContent>
          </Card>
        </aside>
      </div>

      <DealForm
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) refetch();
        }}
        deal={deal}
      />

      <LogCallModal
        open={callOpen}
        onOpenChange={setCallOpen}
        contactId={deal.contact_id}
        companyId={deal.company_id}
        dealId={deal.id}
        createdBy={actorId}
        invalidateKey={['activities', 'deal', deal.id]}
      />

      <CreateTaskModal
        open={taskOpen}
        onOpenChange={setTaskOpen}
        contactId={deal.contact_id}
        companyId={deal.company_id}
        dealId={deal.id}
        createdBy={actorId}
        invalidateKey={['activities', 'deal', deal.id]}
      />
      </PageTransition>
    </DashboardLayout>
  );
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="max-w-[62%] text-right text-sm font-medium">{value}</span>
    </div>
  );
}

function SidePill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted px-2 py-1">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-xs font-semibold">{value}</p>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-center text-sm text-muted-foreground">
      {text}
    </p>
  );
}
