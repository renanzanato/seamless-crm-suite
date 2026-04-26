import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  CheckCircle2,
  Clock,
  Mail,
  MessageSquare,
  Pause,
  Phone,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Can } from "@/components/Can";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCompanies, getContactsByCompany } from "@/services/crmService";
import { listSequences } from "@/services/sequencesService";
import {
  getCadenceTracks,
  runSequenceWorker,
  setCadenceTrackStatus,
  startCadenceForContacts,
  type CadenceTrack,
  type CadenceTrackStatus,
} from "@/services/abmService";
import { inferPersonaFromRole, PERSONA_PLAYBOOK, PIPA_21_DAY_CADENCE } from "@/lib/pipaGtm";
import type { Contact, Sequence } from "@/types";

const CHANNEL_ICON = {
  whatsapp: MessageSquare,
  linkedin: Users,
  phone: Phone,
  email: Mail,
};

const STATUS_LABEL: Record<CadenceTrackStatus, string> = {
  pending: "Pendente",
  done: "Feita",
  skipped: "Pulada",
  replied: "Respondeu",
  active: "Ativa",
  paused: "Pausada",
  completed: "Completa",
  meeting_booked: "Reuniao marcada",
  proposal_sent: "Proposta enviada",
  won: "Ganha",
  lost: "Perdida",
  errored: "Erro",
};

const CONVERTED_STATUSES = new Set<CadenceTrackStatus>(["meeting_booked", "proposal_sent", "won"]);
const DONE_STATUSES = new Set<CadenceTrackStatus>([
  "completed",
  "meeting_booked",
  "proposal_sent",
  "won",
  "lost",
]);

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function getStatusVariant(status: CadenceTrackStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "active") return "default";
  if (status === "errored" || status === "lost") return "destructive";
  if (status === "paused") return "secondary";
  return "outline";
}

function getNextStep(track: CadenceTrack) {
  const currentDay = Math.max(track.cadence_day ?? 1, 1);
  return PIPA_21_DAY_CADENCE
    .filter((step) => step.personas.includes(track.persona_type) && step.day >= currentDay)
    .sort((a, b) => a.day - b.day)[0] ?? null;
}

function TrackStats({ tracks }: { tracks: CadenceTrack[] }) {
  const total = tracks.length;
  const active = tracks.filter((track) => track.status === "active").length;
  const completed = tracks.filter((track) => DONE_STATUSES.has(track.status)).length;
  const converted = tracks.filter((track) => CONVERTED_STATUSES.has(track.status)).length;
  const conversionRate = total ? Math.round((converted / total) * 100) : 0;

  const cards = [
    { label: "Ativas", value: active, icon: Play, tone: "text-primary" },
    { label: "Completadas", value: completed, icon: CheckCircle2, tone: "text-green-600" },
    { label: "Conversao", value: `${conversionRate}%`, icon: TrendingUp, tone: "text-emerald-600" },
    { label: "Total", value: total, icon: Workflow, tone: "text-muted-foreground" },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-4">
      {cards.map(({ label, value, icon: Icon, tone }) => (
        <Card key={label}>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-semibold">{value}</p>
            </div>
            <Icon className={`h-5 w-5 ${tone}`} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TracksTable({
  tracks,
  isLoading,
  onToggleStatus,
  pendingTrackId,
}: {
  tracks: CadenceTrack[];
  isLoading: boolean;
  onToggleStatus: (track: CadenceTrack) => void;
  pendingTrackId: string | null;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-14 rounded-lg" />
        ))}
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
        <Workflow className="mx-auto mb-2 h-8 w-8 opacity-40" />
        <p className="text-sm">Nenhuma cadencia enrolada ainda.</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Empresa</TableHead>
          <TableHead>Contato</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Dia</TableHead>
          <TableHead>Proxima acao</TableHead>
          <TableHead className="w-28 text-right">Acoes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tracks.map((track) => {
          const nextStep = getNextStep(track);
          const Icon = nextStep ? CHANNEL_ICON[nextStep.channel] : CheckCircle2;
          const canToggle = track.status === "active" || track.status === "paused";
          return (
            <TableRow key={track.id}>
              <TableCell>
                <div className="font-medium">{track.company?.name ?? "Conta sem nome"}</div>
                <div className="text-xs text-muted-foreground">Enrolled {formatDate(track.enrolled_at ?? track.created_at)}</div>
              </TableCell>
              <TableCell>
                <div className="font-medium">{track.contact?.name ?? "Sem contato"}</div>
                <div className="text-xs text-muted-foreground">
                  {PERSONA_PLAYBOOK[track.persona_type]?.label ?? track.persona_type}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={getStatusVariant(track.status)}>{STATUS_LABEL[track.status] ?? track.status}</Badge>
              </TableCell>
              <TableCell>
                <span className="font-medium">{track.cadence_day ?? 1}</span>
                <span className="text-xs text-muted-foreground"> / 21</span>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{nextStep?.label ?? "Cadencia concluida"}</p>
                    {nextStep && (
                      <p className="text-xs text-muted-foreground">
                        Dia {nextStep.day} · Bloco {nextStep.block} · {nextStep.channel}
                      </p>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={!canToggle || pendingTrackId === track.id}
                  onClick={() => onToggleStatus(track)}
                >
                  {track.status === "active" ? (
                    <>
                      <Pause className="h-3.5 w-3.5" /> Pausar
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" /> Retomar
                    </>
                  )}
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function SequenceLibrary({ sequences, isLoading }: { sequences: Sequence[]; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-28 rounded-xl" />;

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {sequences.map((sequence) => (
        <Card key={sequence.id}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{sequence.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{sequence.steps?.length ?? 0} steps</p>
              </div>
              <Badge variant={sequence.active ? "default" : "secondary"}>
                {sequence.active ? "Ativa" : "Inativa"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
      {sequences.length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground md:col-span-2 xl:col-span-3">
          <Workflow className="mx-auto mb-2 h-8 w-8 opacity-40" />
          <p className="text-sm">Nenhum template customizado criado.</p>
        </div>
      )}
    </div>
  );
}

export default function SequenciasPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [companyId, setCompanyId] = useState("");
  const [contactId, setContactId] = useState("");
  const [pendingTrackId, setPendingTrackId] = useState<string | null>(null);

  const { data: companies = [], isLoading: loadingCompanies } = useQuery({
    queryKey: ["companies"],
    queryFn: () => getCompanies(),
  });

  const selectedCompany = companies.find((company) => company.id === companyId) ?? null;

  const { data: contacts = [], isLoading: loadingContacts } = useQuery({
    queryKey: ["contacts-by-company", companyId],
    queryFn: () => getContactsByCompany(companyId),
    enabled: !!companyId,
  });

  const selectedContact = contacts.find((contact) => contact.id === contactId) ?? null;

  const { data: tracks = [], isLoading: loadingTracks } = useQuery({
    queryKey: ["cadence-tracks"],
    queryFn: getCadenceTracks,
    refetchInterval: 60_000,
  });

  const { data: sequences = [], isLoading: loadingSequences } = useQuery({
    queryKey: ["sequences"],
    queryFn: listSequences,
  });

  useEffect(() => {
    setContactId("");
  }, [companyId]);

  const contactsWithPersona = useMemo(() => {
    return contacts.map((contact) => ({
      contact,
      persona: inferPersonaFromRole(contact.role),
    }));
  }, [contacts]);

  const refreshSequences = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["cadence-tracks"] }),
      queryClient.invalidateQueries({ queryKey: ["daily-tasks"] }),
      queryClient.invalidateQueries({ queryKey: ["abm-stats"] }),
      queryClient.invalidateQueries({ queryKey: ["companies"] }),
    ]);

  const enrollMutation = useMutation({
    mutationFn: () => {
      if (!selectedCompany || !selectedContact) throw new Error("Selecione empresa e contato.");
      return startCadenceForContacts({
        companyId: selectedCompany.id,
        companyName: selectedCompany.name,
        contacts: [{
          id: selectedContact.id,
          name: selectedContact.name,
          role: selectedContact.role,
        }],
      });
    },
    onSuccess: async (createdTasks) => {
      await refreshSequences();
      setContactId("");
      toast.success(`Enroll criado. ${createdTasks} tarefa(s) geradas para hoje.`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const statusMutation = useMutation({
    mutationFn: async (track: CadenceTrack) => {
      setPendingTrackId(track.id);
      const next = track.status === "active" ? "paused" : "active";
      await setCadenceTrackStatus(track.id, next);
    },
    onSuccess: async () => {
      await refreshSequences();
      toast.success("Cadencia atualizada.");
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => setPendingTrackId(null),
  });

  const workerMutation = useMutation({
    mutationFn: runSequenceWorker,
    onSuccess: async () => {
      await refreshSequences();
      toast.success("Worker executado.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <DashboardLayout>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Workflow className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold">Sequencias</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadencias ativas, tarefas geradas pelo worker e conversao por conta.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => workerMutation.mutate()}
            disabled={workerMutation.isPending}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${workerMutation.isPending ? "animate-spin" : ""}`} />
            Rodar worker
          </Button>
          <Can admin>
            <Button onClick={() => navigate("/sequencias-v2/nova")} className="gap-2">
              <Plus className="h-4 w-4" />
              Novo template
            </Button>
          </Can>
        </div>
      </div>

      <div className="space-y-5">
        <TrackStats tracks={tracks} />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Workflow className="h-4 w-4 text-primary" />
                Cadencias enroladas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TracksTable
                tracks={tracks}
                isLoading={loadingTracks}
                pendingTrackId={pendingTrackId}
                onToggleStatus={(track) => statusMutation.mutate(track)}
              />
            </CardContent>
          </Card>

          <aside className="space-y-5">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Enroll
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select value={companyId || "__none__"} onValueChange={(value) => setCompanyId(value === "__none__" ? "" : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Selecione uma empresa</SelectItem>
                    {loadingCompanies ? (
                      <SelectItem value="__loading__" disabled>Carregando...</SelectItem>
                    ) : (
                      companies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>

                <Select
                  value={contactId || "__none__"}
                  onValueChange={(value) => setContactId(value === "__none__" ? "" : value)}
                  disabled={!companyId || loadingContacts}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Contato" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Selecione um contato</SelectItem>
                    {contactsWithPersona.map(({ contact, persona }) => (
                      <SelectItem key={contact.id} value={contact.id}>
                        {contact.name} · {PERSONA_PLAYBOOK[persona].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedContact && (
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                    <p className="font-medium">{selectedContact.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedContact.role || "Cargo nao informado"}
                    </p>
                  </div>
                )}

                <Button
                  className="w-full gap-2"
                  disabled={!selectedCompany || !selectedContact || enrollMutation.isPending}
                  onClick={() => enrollMutation.mutate()}
                >
                  <Sparkles className="h-4 w-4" />
                  {enrollMutation.isPending ? "Enrolando..." : "Enroll"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="h-4 w-4 text-primary" />
                  PIPA 21 dias
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {PIPA_21_DAY_CADENCE.map((step) => {
                  const Icon = CHANNEL_ICON[step.channel];
                  return (
                    <div key={`${step.day}-${step.taskType}-${step.label}`} className="flex gap-3 rounded-lg border bg-background p-3">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="outline">Dia {step.day}</Badge>
                          <Badge variant="outline">Bloco {step.block}</Badge>
                        </div>
                        <p className="mt-1 text-sm font-medium">{step.label}</p>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </aside>
        </div>

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Templates customizados
            </h2>
          </div>
          <SequenceLibrary sequences={sequences} isLoading={loadingSequences} />
        </section>
      </div>
    </DashboardLayout>
  );
}
