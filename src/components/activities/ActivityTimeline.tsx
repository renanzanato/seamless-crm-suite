import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  getActivitiesForContact,
  getActivitiesForCompany,
  getActivitiesForDeal,
  type Activity,
  type ActivityKind,
} from "@/services/activitiesService";
import { renderActivity } from "./TimelineItems";
import { ActivitySkeleton } from "./ActivitySkeleton";
import { ActivityEmptyState } from "./ActivityEmptyState";

// ────────────────────────────────────────────────────────────
// ActivityTimeline — feed cronológico unificado.
// Leitor do topo pro fundo (mais recente primeiro).
// ────────────────────────────────────────────────────────────

interface Props {
  contactId?: string;
  companyId?: string;
  dealId?: string;
  kindFilter?: ActivityKind[];
  emptyHint?: string;
  /** Esconde os chips de filtro (quando o parent já controla). */
  hideFilters?: boolean;
  /** Polling em ms. Default 30000. Passa 0 para desligar. */
  pollMs?: number;
  /** Callback opcional pro CTA "Adicionar primeira nota" do empty state. */
  onAddNote?: () => void;
}

const ALL_KINDS: { kind: ActivityKind; label: string }[] = [
  { kind: "whatsapp",        label: "WhatsApp" },
  { kind: "email",           label: "E-mail" },
  { kind: "call",            label: "Ligações" },
  { kind: "meeting",         label: "Reuniões" },
  { kind: "note",            label: "Notas" },
  { kind: "task",            label: "Tarefas" },
  { kind: "stage_change",    label: "Stage" },
  { kind: "property_change", label: "Propriedades" },
  { kind: "sequence_step",   label: "Cadência" },
  { kind: "enrollment",      label: "Enrollments" },
];

// ── Day grouping ───────────────────────────────────────────

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayLabel(ms: number): string {
  const d = new Date(ms);
  const today = startOfDay(new Date());
  const diff = Math.round((today - ms) / (24 * 60 * 60 * 1000));
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Ontem";
  if (diff < 7) return ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][d.getDay()];
  return `${String(d.getDate()).padStart(2, "0")} de ${MONTHS[d.getMonth()]}. ${d.getFullYear()}`;
}

interface DayGroup {
  key: number;
  label: string;
  items: Activity[];
}

function groupByDay(items: Activity[]): DayGroup[] {
  const groups = new Map<number, Activity[]>();
  for (const item of items) {
    const d = new Date(item.occurredAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = startOfDay(d);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return Array.from(groups.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([key, arr]) => ({ key, label: dayLabel(key), items: arr }));
}

// ── Main ───────────────────────────────────────────────────

export function ActivityTimeline({
  contactId,
  companyId,
  dealId,
  kindFilter,
  emptyHint = "Nenhuma atividade registrada ainda.",
  hideFilters = false,
  pollMs = 30_000,
  onAddNote,
}: Props) {
  const scope = contactId
    ? { kind: "contact" as const, id: contactId }
    : companyId
    ? { kind: "company" as const, id: companyId }
    : dealId
    ? { kind: "deal" as const, id: dealId }
    : null;

  const [activeKinds, setActiveKinds] = useState<ActivityKind[] | null>(
    kindFilter && kindFilter.length > 0 ? kindFilter : null,
  );

  const { data: activities = [], isLoading, error } = useQuery<Activity[]>({
    queryKey: ["activities", scope?.kind, scope?.id, activeKinds?.join(",") ?? "all"],
    queryFn: async () => {
      if (!scope) return [];
      const opts = activeKinds ? { kinds: activeKinds } : undefined;
      if (scope.kind === "contact") return getActivitiesForContact(scope.id, opts);
      if (scope.kind === "company") return getActivitiesForCompany(scope.id, opts);
      return getActivitiesForDeal(scope.id, opts);
    },
    enabled: Boolean(scope),
    refetchInterval: pollMs > 0 ? pollMs : false,
  });

  const groups = useMemo(() => groupByDay(activities), [activities]);

  if (!scope) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Configuração inválida</AlertTitle>
        <AlertDescription>ActivityTimeline precisa de contactId, companyId ou dealId.</AlertDescription>
      </Alert>
    );
  }

  const toggleKind = (k: ActivityKind) => {
    setActiveKinds((prev) => {
      if (!prev) return [k];
      if (prev.includes(k)) {
        const next = prev.filter((p) => p !== k);
        return next.length === 0 ? null : next;
      }
      return [...prev, k];
    });
  };

  return (
    <div className="flex h-full flex-col">
      {!hideFilters && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={activeKinds === null ? "default" : "outline"}
            onClick={() => setActiveKinds(null)}
            className="h-7 px-2.5 text-xs"
          >
            Tudo
          </Button>
          {ALL_KINDS.map(({ kind, label }) => {
            const active = activeKinds?.includes(kind) ?? false;
            return (
              <Button
                key={kind}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                onClick={() => toggleKind(kind)}
                className="h-7 px-2.5 text-xs"
              >
                {label}
              </Button>
            );
          })}
        </div>
      )}

      {isLoading && <ActivitySkeleton />}

      {!isLoading && error && (
        <Alert variant="destructive">
          <AlertTitle>Falha ao carregar atividades</AlertTitle>
          <AlertDescription className="text-xs">
            {error instanceof Error ? error.message : String(error)}
          </AlertDescription>
        </Alert>
      )}

      {!isLoading && !error && activities.length === 0 && (
        <ActivityEmptyState hint={emptyHint} onAddNote={onAddNote} />
      )}

      {!isLoading && !error && activities.length > 0 && (
        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          {groups.map((group) => (
            <div key={group.key}>
              <div className="mb-2 flex items-center">
                <span className="rounded-md bg-muted px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </span>
                <div className="ml-3 h-px flex-1 bg-border" />
              </div>
              <div className={cn("space-y-0")}>
                {group.items.map((activity) => (
                  <div key={activity.id}>{renderActivity(activity)}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
