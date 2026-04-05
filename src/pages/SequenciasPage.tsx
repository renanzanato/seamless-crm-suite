import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Workflow, GitBranch, Layers, Power } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Can } from '@/components/Can';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { listSequences, toggleSequenceActive } from '@/services/sequencesService';
import type { Sequence } from '@/types';

export default function SequenciasPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    listSequences()
      .then(setSequences)
      .catch(() => toast({ title: 'Erro ao carregar sequências', variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [toast]);

  async function handleToggle(seq: Sequence) {
    setToggling(seq.id);
    try {
      await toggleSequenceActive(seq.id, !seq.active);
      setSequences((prev) =>
        prev.map((s) => (s.id === seq.id ? { ...s, active: !s.active } : s))
      );
    } catch {
      toast({ title: 'Erro ao alterar status', variant: 'destructive' });
    } finally {
      setToggling(null);
    }
  }

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sequências</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Automatize mensagens ao mover deals entre estágios
          </p>
        </div>
        <Can admin>
          <Button onClick={() => navigate('/sequencias/nova')} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova sequência
          </Button>
        </Can>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="chart-card animate-pulse h-36" />
          ))}
        </div>
      ) : sequences.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-24 gap-3 text-center"
        >
          <Workflow className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground font-medium">Nenhuma sequência criada ainda</p>
          <Can admin>
            <Button variant="outline" size="sm" onClick={() => navigate('/sequencias/nova')} className="gap-2">
              <Plus className="h-4 w-4" />
              Criar primeira sequência
            </Button>
          </Can>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sequences.map((seq, i) => (
            <motion.div
              key={seq.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="chart-card flex flex-col gap-4 cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all"
              onClick={() => navigate(`/sequencias/${seq.id}`)}
            >
              {/* Card header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Workflow className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{seq.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {seq.steps?.length ?? 0} step{(seq.steps?.length ?? 0) !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                {/* Toggle */}
                <Can admin>
                  <Switch
                    checked={seq.active}
                    disabled={toggling === seq.id}
                    onCheckedChange={() => handleToggle(seq)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={seq.active ? 'Desativar sequência' : 'Ativar sequência'}
                  />
                </Can>
              </div>

              {/* Funnel + Stage */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <GitBranch className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{seq.funnel?.name ?? '—'}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Layers className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{seq.stage?.name ?? '—'}</span>
                </div>
              </div>

              {/* Status badge */}
              <div className="flex items-center gap-2">
                <Badge
                  variant={seq.active ? 'default' : 'secondary'}
                  className="text-[11px] gap-1"
                >
                  <Power className="h-2.5 w-2.5" />
                  {seq.active ? 'Ativa' : 'Inativa'}
                </Badge>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}