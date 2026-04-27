import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Monitor, Wifi, WifiOff, AlertTriangle, Clock, RefreshCw, Shield,
} from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { returnEmptyOnOptionalSchema } from '@/lib/supabaseOptional';

interface ExtStatus {
  id: string;
  user_id: string;
  account_hash: string;
  ext_version: string;
  wpp_version: string | null;
  queue_depth: number;
  last_error: string | null;
  state: string;
  last_heartbeat: string;
}

async function getExtensionStatuses(): Promise<ExtStatus[]> {
  const { data, error } = await supabase
    .from('extension_status')
    .select('*')
    .order('last_heartbeat', { ascending: false });
  if (error) return returnEmptyOnOptionalSchema(error, []);
  return (data ?? []) as ExtStatus[];
}

async function setKillSwitch(enabled: boolean): Promise<void> {
  const { error } = await supabase.functions.invoke('extension-config', {
    method: 'PATCH',
    body: { kill_switch: enabled, passive_mode: enabled },
  });
  if (error) throw error;
}

const STATE_CONFIG: Record<string, { icon: typeof Wifi; color: string; label: string }> = {
  healthy: { icon: Wifi, color: 'text-emerald-400', label: 'Saudável' },
  degraded: { icon: AlertTriangle, color: 'text-amber-400', label: 'Degradado' },
  passive: { icon: Shield, color: 'text-blue-400', label: 'Passivo' },
  offline: { icon: WifiOff, color: 'text-red-400', label: 'Offline' },
};

function timeSince(dateStr: string): string {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (secs < 60) return `${secs}s atrás`;
  if (secs < 3600) return `${Math.floor(secs / 60)}min atrás`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h atrás`;
  return `${Math.floor(secs / 86400)}d atrás`;
}

export default function ExtensaoSaude() {
  const queryClient = useQueryClient();
  const { data: statuses = [], isLoading, refetch } = useQuery({
    queryKey: ['extension-status'],
    queryFn: getExtensionStatuses,
    refetchInterval: 30_000,
  });

  const killSwitchMutation = useMutation({
    mutationFn: setKillSwitch,
    onSuccess: (_, enabled) => {
      queryClient.invalidateQueries({ queryKey: ['extension-status'] });
      toast.success(enabled ? 'Kill switch ativado.' : 'Kill switch desativado.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const healthy = statuses.filter((s) => s.state === 'healthy').length;
  const degraded = statuses.filter((s) => s.state === 'degraded').length;
  const offline = statuses.filter((s) => s.state === 'offline').length;

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Monitor className="h-6 w-6 text-primary" />
              Saúde da Extensão
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Monitoramento em tempo real de todas as instâncias da extensão Chrome.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={killSwitchMutation.isPending}
              onClick={() => killSwitchMutation.mutate(true)}
              className="gap-1.5"
            >
              <Shield className="h-3.5 w-3.5" /> Ativar kill switch
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={killSwitchMutation.isPending}
              onClick={() => killSwitchMutation.mutate(false)}
              className="gap-1.5"
            >
              <Shield className="h-3.5 w-3.5" /> Desativar
            </Button>
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar
            </Button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <Wifi className="h-5 w-5 text-emerald-400" />
              <div>
                <p className="text-2xl font-bold">{healthy}</p>
                <p className="text-xs text-muted-foreground">Saudáveis</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              <div>
                <p className="text-2xl font-bold">{degraded}</p>
                <p className="text-xs text-muted-foreground">Degradados</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <WifiOff className="h-5 w-5 text-red-400" />
              <div>
                <p className="text-2xl font-bold">{offline}</p>
                <p className="text-xs text-muted-foreground">Offline</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Instance list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <div key={i} className="h-20 bg-muted/50 rounded-xl animate-pulse" />)}
          </div>
        ) : statuses.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Monitor className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhuma extensão registrada ainda.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {statuses.map((s) => {
              const cfg = STATE_CONFIG[s.state] ?? STATE_CONFIG.offline;
              const StateIcon = cfg.icon;
              const isStale = Date.now() - new Date(s.last_heartbeat).getTime() > 120_000;

              return (
                <Card key={s.id} className={isStale ? 'border-red-500/30' : ''}>
                  <CardContent className="flex items-center gap-4 py-4">
                    <div className={`p-2 rounded-lg bg-muted/50 ${cfg.color}`}>
                      <StateIcon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{s.account_hash.slice(0, 12)}…</span>
                        <Badge className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>
                        <Badge variant="outline" className="text-xs">v{s.ext_version}</Badge>
                        {s.wpp_version && <Badge variant="secondary" className="text-xs">WPP {s.wpp_version}</Badge>}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {timeSince(s.last_heartbeat)}
                        </span>
                        <span>Fila: {s.queue_depth}</span>
                        {s.last_error && (
                          <span className="text-red-400 truncate max-w-[200px]">{s.last_error}</span>
                        )}
                      </div>
                    </div>
                    {isStale && (
                      <Badge variant="destructive" className="text-xs shrink-0">
                        &gt;2min sem heartbeat
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
