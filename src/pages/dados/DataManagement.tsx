import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { motion } from "framer-motion";
import {
  Search,
  Filter,
  Users,
  UserCheck,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
} from "lucide-react";
import { fetchContacts, bulkAssignResponsible, bulkMoveLifecycleStage, Contact } from "@/services/enrichmentService";
import { supabase } from "@/lib/supabase";
import { Profile } from "@/types";

const LIFECYCLE_STAGES = [
  { value: "all", label: "Todos os lifecycles" },
  { value: "subscriber", label: "Subscriber" },
  { value: "lead", label: "Lead" },
  { value: "mql", label: "MQL" },
  { value: "sql", label: "SQL" },
  { value: "opportunity", label: "Oportunidade" },
  { value: "customer", label: "Cliente" },
  { value: "evangelist", label: "Evangelista" },
  { value: "disqualified", label: "Desqualificado" },
];

const LIFECYCLE_BADGE_COLORS: Record<string, string> = {
  subscriber:       "bg-muted text-muted-foreground border-border",
  lead:             "bg-muted text-muted-foreground border-border",
  mql:              "bg-primary/10 text-primary border-primary/20",
  sql:              "bg-orange-500/10 text-orange-500 border-orange-500/20",
  opportunity:      "bg-blue-500/10 text-blue-500 border-blue-500/20",
  customer:         "bg-green-500/10 text-green-500 border-green-500/20",
  evangelist:       "bg-purple-500/10 text-purple-500 border-purple-500/20",
  disqualified:     "bg-destructive/10 text-destructive border-destructive/20",
};

type SortField = "name" | "company" | "city" | "lifecycle_stage" | "created_at";
type SortDir = "asc" | "desc";

export default function DataManagement() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const [search, setSearch] = useState("");
  const [filterLifecycleStage, setFilterLifecycleStage] = useState("all");
  const [filterCity, setFilterCity] = useState("");
  const [filterSegment, setFilterSegment] = useState("");
  const [filterResponsible, setFilterResponsible] = useState("all");

  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [bulkLifecycleStage, setBulkLifecycleStage] = useState("");
  const [bulkResponsible, setBulkResponsible] = useState("");
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    load();
    supabase
      .from("profiles")
      .select("id, name, role, created_at")
      .then(({ data }) => setProfiles((data as Profile[]) ?? []));
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchContacts();
      setContacts(data);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    let list = contacts;

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q) ||
          (c.company ?? "").toLowerCase().includes(q),
      );
    }
    if (filterLifecycleStage !== "all") list = list.filter((c) => c.lifecycle_stage === filterLifecycleStage);
    if (filterCity) list = list.filter((c) => (c.city ?? "").toLowerCase().includes(filterCity.toLowerCase()));
    if (filterSegment) list = list.filter((c) => (c.segment ?? "").toLowerCase().includes(filterSegment.toLowerCase()));
    if (filterResponsible !== "all") list = list.filter((c) => c.responsible_id === filterResponsible);

    list = [...list].sort((a, b) => {
      const av = (a[sortField as keyof Contact] ?? "") as string;
      const bv = (b[sortField as keyof Contact] ?? "") as string;
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });

    return list;
  }, [contacts, search, filterLifecycleStage, filterCity, filterSegment, filterResponsible, sortField, sortDir]);

  const allSelected = filtered.length > 0 && selected.length === filtered.length;

  function toggleAll() {
    setSelected(allSelected ? [] : filtered.map((c) => c.id));
  }

  function toggleOne(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc"
      ? <ChevronUp className="h-3 w-3 text-primary" />
      : <ChevronDown className="h-3 w-3 text-primary" />;
  }

  async function applyBulk() {
    if (selected.length === 0) return;
    setApplying(true);
    try {
      if (bulkResponsible && bulkResponsible !== "none") {
        await bulkAssignResponsible(selected, bulkResponsible);
      }
      if (bulkLifecycleStage && bulkLifecycleStage !== "none") {
        await bulkMoveLifecycleStage(selected, bulkLifecycleStage as Contact["lifecycle_stage"]);
      }
      await load();
      setSelected([]);
      setBulkLifecycleStage("");
      setBulkResponsible("");
    } finally {
      setApplying(false);
    }
  }

  const responsibleName = (id: string | null) =>
    profiles.find((p) => p.id === id)?.name ?? "—";

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gerenciamento de Dados</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {contacts.length} contatos no total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{filtered.length} exibidos</span>
        </div>
      </div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="chart-card mb-4"
      >
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filtros</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email, empresa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={filterLifecycleStage} onValueChange={setFilterLifecycleStage}>
            <SelectTrigger><SelectValue placeholder="Lifecycle" /></SelectTrigger>
            <SelectContent>
              {LIFECYCLE_STAGES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            placeholder="Cidade"
            value={filterCity}
            onChange={(e) => setFilterCity(e.target.value)}
          />

          <Input
            placeholder="Segmento"
            value={filterSegment}
            onChange={(e) => setFilterSegment(e.target.value)}
          />
        </div>
      </motion.div>

      {/* Bulk actions */}
      {selected.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl border border-primary/20 bg-primary/5"
        >
          <UserCheck className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium text-primary">{selected.length} selecionados</span>
          <div className="flex-1 flex items-center gap-2 flex-wrap">
            <Select value={bulkResponsible} onValueChange={setBulkResponsible}>
              <SelectTrigger className="w-44 h-8 text-xs">
                <SelectValue placeholder="Atribuir responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name ?? p.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={bulkLifecycleStage} onValueChange={setBulkLifecycleStage}>
              <SelectTrigger className="w-44 h-8 text-xs">
                <SelectValue placeholder="Mover lifecycle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Manter atual</SelectItem>
                {LIFECYCLE_STAGES.slice(1).map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <button
              onClick={applyBulk}
              disabled={applying || (!bulkLifecycleStage && !bulkResponsible)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
            >
              {applying ? "Aplicando..." : "Aplicar"}
            </button>
          </div>
          <button
            onClick={() => setSelected([])}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
          >
            Limpar seleção
          </button>
        </motion.div>
      )}

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl border border-border overflow-hidden"
      >
        {/* Head */}
        <div className="grid grid-cols-[40px_1fr_140px_120px_120px_110px] gap-3 px-4 py-2.5 bg-secondary/50 border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <div className="flex items-center justify-center">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="h-4 w-4 rounded accent-primary cursor-pointer"
            />
          </div>
          <button className="flex items-center gap-1 text-left hover:text-foreground transition-colors" onClick={() => toggleSort("name")}>
            Nome <SortIcon field="name" />
          </button>
          <button className="flex items-center gap-1 text-left hover:text-foreground transition-colors" onClick={() => toggleSort("company")}>
            Empresa <SortIcon field="company" />
          </button>
          <button className="flex items-center gap-1 text-left hover:text-foreground transition-colors" onClick={() => toggleSort("city")}>
            Cidade <SortIcon field="city" />
          </button>
          <button className="flex items-center gap-1 text-left hover:text-foreground transition-colors" onClick={() => toggleSort("lifecycle_stage")}>
            Lifecycle <SortIcon field="lifecycle_stage" />
          </button>
          <span>Responsável</span>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-sm text-muted-foreground">
            Nenhum contato encontrado com os filtros atuais.
          </div>
        ) : (
          filtered.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.015 }}
              className={`grid grid-cols-[40px_1fr_140px_120px_120px_110px] gap-3 px-4 py-3 border-b border-border hover:bg-secondary/30 transition-colors items-center ${
                selected.includes(c.id) ? "bg-primary/5" : ""
              }`}
            >
              <div className="flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={selected.includes(c.id)}
                  onChange={() => toggleOne(c.id)}
                  className="h-4 w-4 rounded accent-primary cursor-pointer"
                />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                <p className="text-xs text-muted-foreground truncate">{c.email ?? "—"}</p>
              </div>
              <span className="text-sm text-foreground truncate">{c.company ?? "—"}</span>
              <span className="text-sm text-foreground truncate">{c.city ?? "—"}</span>
              <Badge className={`text-[10px] w-fit ${LIFECYCLE_BADGE_COLORS[c.lifecycle_stage] ?? ""}`}>
                {LIFECYCLE_STAGES.find((s) => s.value === c.lifecycle_stage)?.label ?? c.lifecycle_stage}
              </Badge>
              <span className="text-xs text-muted-foreground truncate">
                {responsibleName(c.responsible_id)}
              </span>
            </motion.div>
          ))
        )}
      </motion.div>
    </DashboardLayout>
  );
}
