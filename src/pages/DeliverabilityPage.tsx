import { useQuery } from '@tanstack/react-query';
import {
  Shield, Activity, TrendingUp, TrendingDown, AlertTriangle, RefreshCw, Gauge,
} from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { returnEmptyOnOptionalSchema } from '@/lib/supabaseOptional';

interface QualitySample {
  id: number;
  account_hash: string;
  quality_band: string | null;
  blocks_24h: number;
  reports_24h: number;
  sent_24h: number;
  replied_24h: number;
  sampled_at: string;
}

interface DeliverabilityAction {
  id: string;
  account_hash: string;
  action: string;
  reason: string;
  triggered_at: string;
  resolved_at: string | null;
}

async function getRecentSamples(): Promise<QualitySample[]> {
  const { data, error } = await supabase
    .from('wa_quality_samples')
    .select('*')
    .order('sampled_at', { ascending: false })
    .limit(50);
  if (error) return returnEmptyOnOptionalSchema(error, []);
  return (data ?? []) as QualitySample[];
}

async function getActiveActions(): Promise<DeliverabilityAction[]> {
  const { data, error } = await supabase
    .from('deliverability_actions')
    .select('*')
    .is('resolved_at', null)
    .order('triggered_at', { ascending: false });
  if (error) return returnEmptyOnOptionalSchema(error, []);
  return (data ?? []) as DeliverabilityAction[];
}

const BAND_CONFIG: Record<string, { color: string; label: string; bg: string }> = {
  green: { color: 'text-emerald-400', label: 'Verde', bg: 'bg-emerald-500/15' },
  yellow: { color: 'text-yellow-400', label: 'Amarelo', bg: 'bg-yellow-500/15' },
  red: { color: 'text-red-400', label: 'Vermelho', bg: 'bg-red-500/15' },
  unknown: { color: 'text-zinc-400', label: 'Desconhecido', bg: 'bg-zinc-500/15' },
};

const ACTION_LABELS: Record<string, string> = {
  throttle_up: 'Throttle ↑',
  throttle_down: 'Throttle ↓',
  pause_outbound: 'Outbound pausado',
  warning_banner: 'Aviso ativo',
  clear: 'Resolvido',
};

export default function DeliverabilityPage() {
  const { data: samples = [], isLoading: loadingSamples, refetch: refetchSamples } = useQuery({
    queryKey: ['wa-quality-samples'],
    queryFn: getRecentSamples,
    refetchInterval: 60_000,
  });

  const { data: actions = [] } = useQuery({
    queryKey: ['deliverability-actions'],
    queryFn: getActiveActions,
    refetchInterval: 60_000,
  });

  // Aggregate latest sample per account_hash
  const latestByHash = new Map<string, QualitySample>();
  for (const s of samples) {
    if (!latestByHash.has(s.account_hash)) {
      latestByHash.set(s.account_hash, s);
    }
  }
  const latestSamples = Array.from(latestByHash.values());

  const totalSent = latestSamples.reduce((sum, s) => sum + s.sent_24h, 0);
  const totalBlocks = latestSamples.reduce((sum, s) => sum + s.blocks_24h, 0);
  const totalReplied = latestSamples.reduce((sum, s) => sum + s.replied_24h, 0);
  const replyRate = totalSent > 0 ? ((totalReplied / totalSent) * 100).toFixed(1) : '—';
  const blockRate = totalSent > 0 ? ((totalBlocks / totalSent) * 100).toFixed(1) : '—';

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              Deliverability & Qualidade WhatsApp
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Monitore a qualidade de envio, taxa de bloqueio e ações automáticas de proteção.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refetchSamples()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </Button>
        </div>

        {/* Active alerts banner */}
        {actions.length > 0 && (
          <Card className="border-red-500/30 bg-red-500/5">
            <CardContent className="py-3">
              <div className="flex items-center gap-2 flex-wrap">
                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                <span className="text-sm font-medium text-red-400">
                  {actions.length} ação(ões) ativa(s):
                </span>
                {actions.map((a) => (
                  <Badge key={a.id} variant="destructive" className="text-xs">
                    {ACTION_LABELS[a.action] ?? a.action} — {a.reason}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <Activity className="h-5 w-5 text-blue-400" />
              <div>
                <p className="text-2xl font-bold">{totalSent}</p>
                <p className="text-xs text-muted-foreground">Enviados 24h</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <TrendingUp className="h-5 w-5 text-emerald-400" />
              <div>
                <p className="text-2xl font-bold">{replyRate}%</p>
                <p className="text-xs text-muted-foreground">Taxa de resposta</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <TrendingDown className="h-5 w-5 text-red-400" />
              <div>
                <p className="text-2xl font-bold">{blockRate}%</p>
                <p className="text-xs text-muted-foreground">Taxa de bloqueio</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <Gauge className="h-5 w-5 text-amber-400" />
              <div>
                <p className="text-2xl font-bold">{latestSamples.length}</p>
                <p className="text-xs text-muted-foreground">Contas monitoradas</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Per-account table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Qualidade por conta</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSamples ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted/50 rounded animate-pulse" />)}
              </div>
            ) : latestSamples.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhuma amostra coletada ainda. A extensão envia amostras automaticamente.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-4">Conta</th>
                      <th className="pb-2 pr-4">Qualidade</th>
                      <th className="pb-2 pr-4 text-right">Enviados</th>
                      <th className="pb-2 pr-4 text-right">Respondidos</th>
                      <th className="pb-2 pr-4 text-right">Bloqueios</th>
                      <th className="pb-2 text-right">Última amostra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestSamples.map((s) => {
                      const band = BAND_CONFIG[s.quality_band ?? 'unknown'];
                      return (
                        <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="py-2.5 pr-4 font-mono text-xs">{s.account_hash.slice(0, 12)}…</td>
                          <td className="py-2.5 pr-4">
                            <Badge className={`text-xs ${band.bg} ${band.color}`}>{band.label}</Badge>
                          </td>
                          <td className="py-2.5 pr-4 text-right">{s.sent_24h}</td>
                          <td className="py-2.5 pr-4 text-right">{s.replied_24h}</td>
                          <td className="py-2.5 pr-4 text-right">{s.blocks_24h}</td>
                          <td className="py-2.5 text-right text-xs text-muted-foreground">
                            {new Date(s.sampled_at).toLocaleString('pt-BR')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
