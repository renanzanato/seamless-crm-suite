import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, X, AlertTriangle, Users, ChevronDown, Shield, Star, UserCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  getDealContacts, addDealContact, updateDealContactRole, removeDealContact,
} from '@/services/pipelineEngineService';
import { getContacts } from '@/services/crmService';
import type { BuyingRole, DealContact, Contact } from '@/types';
import { BUYING_ROLES, BUYING_ROLE_LABELS } from '@/types';
import { AvatarInitials } from '@/components/crm/AvatarInitials';

// ── Role color mapping ────────────────────────────────────

const ROLE_COLORS: Record<BuyingRole, string> = {
  decision_maker: 'bg-red-500/15 text-red-400 border-red-500/20',
  economic_buyer: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  champion: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  influencer: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  user: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
  technical: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  legal: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  finance: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  blocker: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
  unknown: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20',
};

const ROLE_ICONS: Partial<Record<BuyingRole, typeof Shield>> = {
  decision_maker: Shield,
  champion: Star,
  economic_buyer: UserCheck,
};

// ── Component ─────────────────────────────────────────────

interface Props {
  dealId: string;
  singleThreadedRisk?: boolean;
}

export function BuyingCommitteePanel({ dealId, singleThreadedRisk }: Props) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedContactId, setSelectedContactId] = useState('');
  const [selectedRole, setSelectedRole] = useState<BuyingRole>('unknown');

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['deal-contacts', dealId],
    queryFn: () => getDealContacts(dealId),
  });

  const { data: allContacts = [] } = useQuery({
    queryKey: ['contacts', 'all'],
    queryFn: () => getContacts(),
    enabled: addOpen,
  });

  const addMutation = useMutation({
    mutationFn: () => addDealContact(dealId, selectedContactId, selectedRole),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deal-contacts', dealId] });
      toast.success('Membro adicionado ao comitê.');
      setAddOpen(false);
      setSelectedContactId('');
      setSelectedRole('unknown');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const roleChangeMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: BuyingRole }) =>
      updateDealContactRole(id, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deal-contacts', dealId] });
      toast.success('Papel atualizado.');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: removeDealContact,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deal-contacts', dealId] });
      toast.success('Membro removido do comitê.');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Contacts not already in committee
  const existingIds = new Set(members.map((m) => m.contact_id));
  const availableContacts = allContacts.filter(
    (c: Contact) => !existingIds.has(c.id) && c.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Comitê de Compra</CardTitle>
              <Badge variant="secondary" className="text-xs">{members.length}</Badge>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Adicionar
            </Button>
          </div>
          {singleThreadedRisk && (
            <div className="flex items-center gap-1.5 mt-2 px-2 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span className="text-xs text-amber-400">
                Risco single-threaded — apenas {members.length} pessoa no comitê
              </span>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-14 bg-muted/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Nenhum membro adicionado. Clique em "Adicionar" para mapear o comitê de compra.
            </p>
          ) : (
            members.map((member) => {
              const RoleIcon = ROLE_ICONS[member.buying_role];
              return (
                <div
                  key={member.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg bg-card border border-border/50 hover:border-border transition-colors group"
                >
                  <AvatarInitials name={member.contact?.name ?? '?'} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{member.contact?.name ?? '—'}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {member.contact?.role ?? member.contact?.email ?? ''}
                    </p>
                  </div>
                  <Select
                    value={member.buying_role}
                    onValueChange={(v) =>
                      roleChangeMutation.mutate({ id: member.id, role: v as BuyingRole })
                    }
                  >
                    <SelectTrigger
                      className={`h-7 w-auto text-xs border ${ROLE_COLORS[member.buying_role]} gap-1 px-2`}
                    >
                      {RoleIcon && <RoleIcon className="h-3 w-3" />}
                      <SelectValue />
                      <ChevronDown className="h-3 w-3 opacity-50" />
                    </SelectTrigger>
                    <SelectContent>
                      {BUYING_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>{BUYING_ROLE_LABELS[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    onClick={() => removeMutation.mutate(member.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Add Member Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar ao comitê de compra</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Buscar contato</Label>
              <Input
                placeholder="Nome do contato..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <div className="max-h-40 overflow-y-auto rounded-md border border-border mt-1">
                  {availableContacts.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-3 text-center">Nenhum contato encontrado</p>
                  ) : (
                    availableContacts.slice(0, 10).map((c: Contact) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`flex items-center gap-2 w-full px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors ${
                          selectedContactId === c.id ? 'bg-primary/10' : ''
                        }`}
                        onClick={() => {
                          setSelectedContactId(c.id);
                          setSearch(c.name);
                        }}
                      >
                        <AvatarInitials name={c.name} size={24} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{c.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{c.role ?? c.email ?? ''}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Papel no comitê</Label>
              <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as BuyingRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BUYING_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{BUYING_ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => addMutation.mutate()}
              disabled={!selectedContactId || addMutation.isPending}
            >
              {addMutation.isPending ? 'Adicionando…' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
