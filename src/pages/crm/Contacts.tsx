import { useEffect, useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Upload, Search, Pencil, Sparkles, ChevronRight } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { PageTransition } from '@/components/PageTransition';
import { AvatarInitials } from '@/components/AvatarInitials';
import { ContactForm } from '@/components/crm/ContactForm';
import { ImportCSV } from '@/components/crm/ImportCSV';
import { Can } from '@/components/Can';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { VirtualTable, type ColumnDef } from '@/components/lists/VirtualTable';
import { ColumnSelector, type ColumnOption } from '@/components/lists/ColumnSelector';
import { AdvancedFilters, applyFilters, type FilterGroup, type FilterFieldDef } from '@/components/lists/AdvancedFilters';
import { BulkActions, exportCSV } from '@/components/lists/BulkActions';
import { SavedLists } from '@/components/lists/SavedLists';
import { getContacts, deleteContact, getProfiles } from '@/services/crmService';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { Contact } from '@/types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------
const ALL_COLUMNS: ColumnOption[] = [
  { key: 'name',       label: 'Nome',        defaultVisible: true },
  { key: 'role',       label: 'Cargo',       defaultVisible: true },
  { key: 'email',      label: 'E-mail',      defaultVisible: true },
  { key: 'whatsapp',   label: 'WhatsApp',    defaultVisible: true },
  { key: 'phone',      label: 'Telefone',    defaultVisible: false },
  { key: 'lifecycle',  label: 'Lifecycle',   defaultVisible: false },
  { key: 'source',     label: 'Origem',      defaultVisible: false },
  { key: 'seniority',  label: 'Senioridade', defaultVisible: false },
  { key: 'linkedin',   label: 'LinkedIn',    defaultVisible: true },
  { key: 'company',    label: 'Empresa',     defaultVisible: true },
  { key: 'owner',      label: 'Responsavel', defaultVisible: true },
  { key: 'created_at', label: 'Criado em',   defaultVisible: true },
  { key: 'actions',    label: '',            defaultVisible: true },
];

// Filter field defs
const FILTER_FIELDS: FilterFieldDef[] = [
  { key: 'name',     label: 'Nome',     type: 'text' },
  { key: 'email',    label: 'E-mail',   type: 'text' },
  { key: 'role',     label: 'Cargo',    type: 'text' },
  { key: 'whatsapp', label: 'WhatsApp', type: 'text' },
  { key: 'lifecycle_stage', label: 'Lifecycle', type: 'enum', options: [
    { value: 'subscriber', label: 'Subscriber' },
    { value: 'lead', label: 'Lead' },
    { value: 'mql', label: 'MQL' },
    { value: 'sql', label: 'SQL' },
    { value: 'opportunity', label: 'Opportunity' },
    { value: 'customer', label: 'Customer' },
    { value: 'evangelist', label: 'Evangelist' },
    { value: 'disqualified', label: 'Disqualified' },
  ]},
  { key: 'source', label: 'Origem', type: 'enum', options: [
    { value: 'Website', label: 'Website' },
    { value: 'Indicacao', label: 'Indicacao' },
    { value: 'LinkedIn', label: 'LinkedIn' },
    { value: 'Instagram', label: 'Instagram' },
    { value: 'Google', label: 'Google' },
    { value: 'Outro', label: 'Outro' },
  ]},
  { key: 'created_at', label: 'Criado em', type: 'date' },
];

const EMPTY_FILTERS: FilterGroup = { connector: 'AND', conditions: [] };

export default function Contacts() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isAdmin, profile } = useAuth();

  // State
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('__all__');
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [visibleCols, setVisibleCols] = useState<string[]>(
    ALL_COLUMNS.filter((c) => c.defaultVisible !== false).map((c) => c.key),
  );
  const [filters, setFilters] = useState<FilterGroup>(EMPTY_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Queries
  const { data: allContacts = [], isLoading } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => getContacts({}),
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: getProfiles,
    enabled: isAdmin,
  });

  // Real-time
  useEffect(() => {
    const channel = supabase
      .channel('contacts-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, () => {
        qc.invalidateQueries({ queryKey: ['contacts'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  // Client-side filtering pipeline: search -> owner -> advanced filters
  const filteredContacts = useMemo(() => {
    let result = allContacts;

    // Text search (debounce handled by useState; fast enough client-side)
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          (c.whatsapp && c.whatsapp.toLowerCase().includes(q)) ||
          (c.phone && c.phone.toLowerCase().includes(q)) ||
          (c.company?.name && c.company.name.toLowerCase().includes(q)),
      );
    }

    // Owner filter
    if (ownerFilter !== '__all__') {
      result = result.filter((c) => c.owner_id === ownerFilter);
    }

    // Advanced filters
    if (filters.conditions.length > 0) {
      result = applyFilters(result as unknown as Record<string, unknown>[], filters) as unknown as Contact[];
    }

    return result;
  }, [allContacts, search, ownerFilter, filters]);

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteContact(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('Contato removido.');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Column defs for VirtualTable
  const columns = useMemo<ColumnDef<Contact>[]>(() => {
    const map: Record<string, ColumnDef<Contact>> = {
      name: {
        key: 'name',
        header: 'Nome',
        width: 'minmax(180px, 2fr)',
        render: (c) => (
          <div className="flex items-center gap-2.5 font-medium">
            <AvatarInitials name={c.name} size="sm" />
            <span className="hover:underline">{c.name}</span>
            {c.enrichment_source && <Sparkles className="h-3 w-3 text-primary" />}
          </div>
        ),
      },
      role: {
        key: 'role',
        header: 'Cargo',
        width: 'minmax(120px, 1fr)',
        render: (c) => <span className="text-muted-foreground">{c.role ?? '\u2014'}</span>,
      },
      email: {
        key: 'email',
        header: 'E-mail',
        width: 'minmax(180px, 1.5fr)',
        render: (c) => <span className="text-muted-foreground">{c.email ?? '\u2014'}</span>,
      },
      whatsapp: {
        key: 'whatsapp',
        header: 'WhatsApp',
        width: 'minmax(130px, 1fr)',
        render: (c) => <span className="text-muted-foreground">{c.whatsapp ?? c.phone ?? '\u2014'}</span>,
      },
      phone: {
        key: 'phone',
        header: 'Telefone',
        width: 'minmax(130px, 1fr)',
        render: (c) => <span className="text-muted-foreground">{c.phone ?? '\u2014'}</span>,
      },
      lifecycle: {
        key: 'lifecycle',
        header: 'Lifecycle',
        width: '120px',
        render: (c) => <span className="text-xs">{c.lifecycle_stage ?? '\u2014'}</span>,
      },
      source: {
        key: 'source',
        header: 'Origem',
        width: '120px',
        render: (c) => <span className="text-xs">{c.source ?? '\u2014'}</span>,
      },
      seniority: {
        key: 'seniority',
        header: 'Senioridade',
        width: '120px',
        render: (c) => <span className="text-xs">{c.seniority ?? '\u2014'}</span>,
      },
      linkedin: {
        key: 'linkedin',
        header: 'LinkedIn',
        width: '80px',
        render: (c) =>
          c.linkedin_url ? (
            <a
              href={c.linkedin_url}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline text-xs"
              onClick={(e) => e.stopPropagation()}
            >
              Perfil
            </a>
          ) : (
            <span className="text-muted-foreground">{'\u2014'}</span>
          ),
      },
      company: {
        key: 'company',
        header: 'Empresa',
        width: 'minmax(140px, 1fr)',
        render: (c) =>
          c.company ? (
            <button
              type="button"
              className="text-left font-medium hover:text-primary hover:underline text-sm"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/crm/empresas/${c.company!.id}`);
              }}
            >
              {c.company.name}
            </button>
          ) : (
            <span className="text-muted-foreground">{'\u2014'}</span>
          ),
      },
      owner: {
        key: 'owner',
        header: 'Responsavel',
        width: '130px',
        render: (c) => <span className="text-sm">{c.owner?.name ?? '\u2014'}</span>,
      },
      created_at: {
        key: 'created_at',
        header: 'Criado em',
        width: '110px',
        render: (c) => (
          <span className="text-muted-foreground text-xs tabular-nums">
            {format(new Date(c.created_at), 'dd/MM/yyyy', { locale: ptBR })}
          </span>
        ),
      },
      actions: {
        key: 'actions',
        header: '',
        width: '60px',
        render: (c) => (
          <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
            <Can admin>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(c);
                  setFormOpen(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </Can>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
          </div>
        ),
      },
    };
    return visibleCols.map((k) => map[k]).filter(Boolean);
  }, [visibleCols, navigate]);

  // Bulk actions
  const handleAssignOwner = useCallback(
    async (ownerId: string) => {
      const ids = Array.from(selectedIds);
      const { error } = await supabase
        .from('contacts')
        .update({ owner_id: ownerId })
        .in('id', ids);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['contacts'] });
      setSelectedIds(new Set());
    },
    [selectedIds, qc],
  );

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await deleteContact(id);
    }
    qc.invalidateQueries({ queryKey: ['contacts'] });
    setSelectedIds(new Set());
  }, [selectedIds, qc]);

  const handleExportCSV = useCallback(() => {
    const selected = filteredContacts.filter((c) => selectedIds.has(c.id));
    const rows = (selected.length > 0 ? selected : filteredContacts);
    const headers = ['Nome', 'Cargo', 'E-mail', 'WhatsApp', 'Telefone', 'Empresa', 'Responsavel', 'Criado em'];
    const csvRows = rows.map((c) => [
      c.name,
      c.role ?? '',
      c.email ?? '',
      c.whatsapp ?? '',
      c.phone ?? '',
      c.company?.name ?? '',
      c.owner?.name ?? '',
      format(new Date(c.created_at), 'dd/MM/yyyy', { locale: ptBR }),
    ]);
    exportCSV('contatos.csv', headers, csvRows);
  }, [filteredContacts, selectedIds]);

  const handleLoadSavedList = useCallback(
    (savedFilters: FilterGroup, savedColumns: string[] | null) => {
      setFilters(savedFilters);
      if (savedColumns) setVisibleCols(savedColumns);
    },
    [],
  );

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  return (
    <DashboardLayout>
      <PageTransition>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contatos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {filteredContacts.length} contato(s)
            {allContacts.length !== filteredContacts.length && ` de ${allContacts.length}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1.5" /> Importar CSV
          </Button>
          <Can admin>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1.5" /> Criar contato
            </Button>
          </Can>
        </div>
      </div>

      {/* Toolbar: search + owner + column selector + saved lists */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar nome, e-mail, whatsapp, empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {isAdmin && profiles.length > 0 && (
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Todos os responsaveis" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os responsaveis</SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name ?? p.id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <ColumnSelector
          storageKey="pipa-cols-contacts"
          columns={ALL_COLUMNS}
          onChange={setVisibleCols}
        />
        {profile && (
          <SavedLists
            entity="contacts"
            ownerId={profile.id}
            currentFilters={filters}
            currentColumns={visibleCols}
            onLoad={handleLoadSavedList}
          />
        )}
      </div>

      {/* Advanced Filters */}
      <div className="mb-3">
        <AdvancedFilters fields={FILTER_FIELDS} value={filters} onChange={setFilters} />
      </div>

      {/* Bulk Actions */}
      <div className="mb-3">
        <BulkActions
          selectedCount={selectedIds.size}
          profiles={profiles}
          onAssignOwner={handleAssignOwner}
          onExportCSV={handleExportCSV}
          onDelete={isAdmin ? handleBulkDelete : undefined}
          onClearSelection={() => setSelectedIds(new Set())}
        />
      </div>

      {/* Virtualized Table */}
      <VirtualTable
        data={filteredContacts}
        columns={columns}
        getRowId={(c) => c.id}
        onRowClick={(c) => navigate(`/crm/contatos/${c.id}`)}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        isLoading={isLoading}
        emptyMessage="Nenhum contato encontrado."
      />

      <ContactForm open={formOpen} onOpenChange={setFormOpen} contact={editing} />
      <ImportCSV open={importOpen} onOpenChange={setImportOpen} />
      </PageTransition>
    </DashboardLayout>
  );
}
