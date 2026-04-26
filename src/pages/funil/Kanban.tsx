import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Plus, DollarSign, Filter, Eye } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { KanbanBoard } from '@/components/funil/KanbanBoard';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DealForm } from '@/components/crm/DealForm';
import { getDeals, getProfiles } from '@/services/crmService';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { Deal } from '@/types';

function fmtMoney(value: number) {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (value >= 1_000) return `R$ ${Math.round(value / 1_000)}k`;
  return `R$ ${value.toLocaleString('pt-BR')}`;
}

export default function Kanban() {
  const qc = useQueryClient();
  const { profile, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [formOpen, setFormOpen] = useState(false);

  // Filters from URL params
  const ownerFilter = searchParams.get('owner') ?? '__all__';
  const viewFilter = searchParams.get('view') ?? 'all'; // 'all' | 'mine'

  const setOwnerFilter = useCallback(
    (v: string) => {
      const next = new URLSearchParams(searchParams);
      if (v === '__all__') next.delete('owner');
      else next.set('owner', v);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const toggleView = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    if (viewFilter === 'all') next.set('view', 'mine');
    else next.delete('view');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, viewFilter]);

  // Data
  const { data: allDeals = [], isLoading } = useQuery({
    queryKey: ['deals-kanban'],
    queryFn: () => getDeals({}),
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: getProfiles,
    enabled: isAdmin,
  });

  // Real-time
  useEffect(() => {
    const channel = supabase
      .channel('kanban-deals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, () => {
        qc.invalidateQueries({ queryKey: ['deals-kanban'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  // Local state for optimistic updates
  const [localDeals, setLocalDeals] = useState<Deal[]>([]);
  useEffect(() => {
    setLocalDeals(allDeals);
  }, [allDeals]);

  // Filter pipeline
  const filteredDeals = useMemo(() => {
    let result = localDeals;

    // View filter: only mine
    if (viewFilter === 'mine' && profile) {
      result = result.filter((d) => d.owner_id === profile.id);
    }

    // Owner filter
    if (ownerFilter !== '__all__') {
      result = result.filter((d) => d.owner_id === ownerFilter);
    }

    return result;
  }, [localDeals, ownerFilter, viewFilter, profile]);

  // Total value
  const totalValue = useMemo(
    () => filteredDeals.reduce((sum, d) => sum + (d.value ?? 0), 0),
    [filteredDeals],
  );

  const handleDealMoved = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['deals-kanban'] });
    qc.invalidateQueries({ queryKey: ['activities'] });
  }, [qc]);

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pipeline</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-muted-foreground">
              {filteredDeals.length} deal(s)
            </p>
            {totalValue > 0 && (
              <div className="flex items-center gap-1 text-sm font-semibold text-emerald-600">
                <DollarSign className="h-4 w-4" />
                {fmtMoney(totalValue)}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <Button
            variant={viewFilter === 'mine' ? 'default' : 'outline'}
            size="sm"
            className="gap-1.5"
            onClick={toggleView}
          >
            <Eye className="h-4 w-4" />
            {viewFilter === 'mine' ? 'So meus' : 'Todos'}
          </Button>

          {/* Owner filter */}
          {isAdmin && profiles.length > 0 && (
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="w-44">
                <Filter className="h-3 w-3 mr-1" />
                <SelectValue placeholder="Responsavel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name ?? p.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* New deal */}
          <Button size="sm" className="gap-1.5" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" /> Novo deal
          </Button>
        </div>
      </div>

      {/* Board */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
          Carregando pipeline...
        </div>
      ) : (
        <KanbanBoard
          deals={filteredDeals}
          onDealsChange={setLocalDeals}
          onDealMoved={handleDealMoved}
        />
      )}

      {/* Deal form */}
      <DealForm open={formOpen} onOpenChange={setFormOpen} />
    </DashboardLayout>
  );
}
