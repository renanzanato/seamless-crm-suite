import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  Briefcase,
  ChevronDown,
  GitBranch,
  KanbanSquare,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { DashboardLayout } from "@/components/DashboardLayout";
import { PageTransition } from "@/components/PageTransition";
import { DealForm } from "@/components/crm/DealForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { KanbanBoard } from "@/components/funil/KanbanBoard";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { deleteDeal, getDeals as getCrmDeals, getProfiles } from "@/services/crmService";
import {
  getDeals as getFunnelDeals,
  getFunnels,
  getStages,
  type Deal as FunnelDeal,
  type Funnel,
  type Stage,
} from "@/services/funnelService";
import type { Deal } from "@/types";
import { DEAL_STAGES } from "@/types";

const STAGE_COLORS: Record<string, string> = {
  "Qualificação": "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  "Proposta": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  "Negociação": "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  "Fechado - Ganho": "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  "Fechado - Perdido": "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

function formatCurrency(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDateOnly(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return format(new Date(year, month - 1, day), "dd/MM/yyyy", { locale: ptBR });
}



export default function PipelinePage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const activeTab = params.get("tab") ?? "lista";

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("__all__");
  const [ownerFilter, setOwnerFilter] = useState("__all__");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Deal | null>(null);
  const [deleting, setDeleting] = useState<Deal | null>(null);
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
  const [boardStages, setBoardStages] = useState<Stage[]>([]);
  const [boardDeals, setBoardDeals] = useState<FunnelDeal[]>([]);
  const [boardLoading, setBoardLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const setTab = useCallback((tab: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", tab);
    setParams(next);
  }, [params, setParams]);

  const { data: deals = [], isLoading } = useQuery({
    queryKey: ["deals", search, stageFilter, ownerFilter],
    queryFn: () =>
      getCrmDeals({
        search,
        stage: stageFilter === "__all__" ? undefined : stageFilter,
        ownerId: ownerFilter === "__all__" ? undefined : ownerFilter,
      }),
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: getProfiles,
    enabled: isAdmin,
  });





  useEffect(() => {
    getFunnels().then((data) => {
      setFunnels(data);
      if (!selectedFunnelId && data.length > 0) setSelectedFunnelId(data[0].id);
    });
  }, [selectedFunnelId]);

  useEffect(() => {
    if (!selectedFunnelId || activeTab !== "kanban") return;
    setBoardLoading(true);
    Promise.all([getStages(selectedFunnelId), getFunnelDeals(selectedFunnelId)])
      .then(([stages, dealsFromFunnel]) => {
        setBoardStages(stages);
        setBoardDeals(dealsFromFunnel);
      })
      .finally(() => setBoardLoading(false));
  }, [selectedFunnelId, activeTab]);

  useEffect(() => {
    const channel = supabase
      .channel("pipeline-workspace")
      .on("postgres_changes", { event: "*", schema: "public", table: "deals" }, () => {
        qc.invalidateQueries({ queryKey: ["deals"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDeal(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deals"] });
      toast.success("Negócio removido.");
      setDeleting(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function confirmDeleteDeal() {
    if (!deleting) return;
    deleteMutation.mutate(deleting.id);
  }

  const selectedFunnel = funnels.find((funnel) => funnel.id === selectedFunnelId);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(deal: Deal) {
    setEditing(deal);
    setFormOpen(true);
  }

  return (
    <DashboardLayout>
      <PageTransition>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Pipeline</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Negócios, kanban, estrutura de funil e templates no mesmo lugar.
          </p>
        </div>
        <Can admin>
          <Button size="sm" onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" /> Criar negócio
          </Button>
        </Can>
      </div>

      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="lista" className="gap-1.5"><Briefcase className="h-4 w-4" /> Lista</TabsTrigger>
          <TabsTrigger value="kanban" className="gap-1.5"><KanbanSquare className="h-4 w-4" /> Kanban</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por título..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Todos os estágios" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os estágios</SelectItem>
                {DEAL_STAGES.map((stage) => <SelectItem key={stage} value={stage}>{stage}</SelectItem>)}
              </SelectContent>
            </Select>
            {isAdmin && profiles.length > 0 && (
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Todos os responsáveis" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos os responsáveis</SelectItem>
                  {profiles.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.name ?? profile.id}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Estágio</TableHead>
                  <TableHead>Funil</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Data prevista</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Carregando...</TableCell></TableRow>}
                {!isLoading && deals.length === 0 && <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Nenhum negócio encontrado.</TableCell></TableRow>}
                {deals.map((deal) => (
                  <TableRow key={deal.id}>
                    <TableCell className="max-w-[180px] truncate font-medium">
                      <button
                        type="button"
                        onClick={() => navigate(`/crm/negocios/${deal.id}`)}
                        className="max-w-full truncate text-left hover:text-primary hover:underline"
                      >
                        {deal.title}
                      </button>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{formatCurrency(deal.value)}</TableCell>
                    <TableCell><span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_COLORS[deal.stage] ?? "bg-muted text-muted-foreground"}`}>{deal.stage}</span></TableCell>
                    <TableCell className="text-muted-foreground">{deal.funnel?.name ?? "—"}</TableCell>
                    <TableCell>{deal.contact?.name ?? "—"}</TableCell>
                    <TableCell>{deal.company ? <button type="button" className="text-left font-medium hover:text-primary hover:underline" onClick={() => navigate(`/crm/empresas/${deal.company!.id}`)}>{deal.company.name}</button> : "—"}</TableCell>
                    <TableCell>{deal.owner?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{deal.expected_close ? formatDateOnly(deal.expected_close) : "—"}</TableCell>
                    <TableCell>
                      <Can admin>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(deal)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleting(deal)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </Can>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="kanban" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">Kanban do funil</h2>
              <p className="text-sm text-muted-foreground">O board faz parte do pipeline, não de uma área separada.</p>
            </div>
            <div className="relative">
              <button onClick={() => setDropdownOpen((open) => !open)} className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary">
                <GitBranch className="h-4 w-4" />
                {selectedFunnel?.name ?? "Selecionar funil"}
                <ChevronDown className="h-4 w-4" />
              </button>
              {dropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                  <div className="absolute right-0 top-full z-20 mt-1 min-w-[220px] rounded-lg border bg-popover shadow-lg">
                    {funnels.map((funnel) => (
                      <button key={funnel.id} onClick={() => { setSelectedFunnelId(funnel.id); setDropdownOpen(false); }} className={`w-full px-4 py-2.5 text-left text-sm hover:bg-secondary ${funnel.id === selectedFunnelId ? "font-semibold text-primary" : "text-foreground"}`}>
                        {funnel.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {boardLoading ? <Skeleton className="h-96 rounded-xl" /> : boardStages.length === 0 ? (
            <div className="flex h-64 items-center justify-center rounded-xl border text-sm text-muted-foreground">Nenhum estágio configurado para este funil.</div>
          ) : (
            <KanbanBoard stages={boardStages} deals={boardDeals} onDealsChange={setBoardDeals} />
          )}
        </TabsContent>


      </Tabs>

      <DealForm open={formOpen} onOpenChange={setFormOpen} deal={editing} />
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover negócio</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover <strong>{deleting?.title}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={confirmDeleteDeal} disabled={deleteMutation.isPending || !deleting}>
              {deleteMutation.isPending ? "Removendo…" : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </PageTransition>
    </DashboardLayout>
  );
}
