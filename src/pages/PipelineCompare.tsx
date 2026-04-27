import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeftRight, Calendar, TrendingUp, TrendingDown, Minus, RefreshCw,
} from 'lucide-react';
import { comparePipelineDates, type PipelineCompareResult } from '@/services/pipelineEngineService';

function formatCurrency(value: number | null) {
  if (value == null) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
  }).format(value);
}

export default function PipelineCompare() {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const [dateA, setDateA] = useState(weekAgo);
  const [dateB, setDateB] = useState(today);

  const { data: result, isLoading, refetch } = useQuery<PipelineCompareResult>({
    queryKey: ['pipeline-compare', dateA, dateB],
    queryFn: () => comparePipelineDates(dateA, dateB),
    enabled: !!(dateA && dateB && dateA !== dateB),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowLeftRight className="h-6 w-6 text-primary" />
            Pipeline Compare
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Compare o estado do pipeline entre duas datas (snapshots diários).
          </p>
        </div>

        {/* Date pickers */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Data A (base)</label>
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Input type="date" value={dateA} onChange={(e) => setDateA(e.target.value)} className="w-40" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Data B (comparação)</label>
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Input type="date" value={dateB} onChange={(e) => setDateB(e.target.value)} className="w-40" />
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Comparar
          </Button>
        </div>

        {isLoading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-28 bg-muted/50 rounded-xl animate-pulse" />)}
          </div>
        )}

        {result && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <SummaryCard icon={TrendingUp} label="Entraram" count={result.entered.length} color="text-emerald-400" />
              <SummaryCard icon={TrendingDown} label="Saíram" count={result.exited.length} color="text-red-400" />
              <SummaryCard icon={ArrowLeftRight} label="Mudaram de estágio" count={result.stageChanged.length} color="text-blue-400" />
              <SummaryCard icon={Minus} label="Mudaram de valor" count={result.valueChanged.length} color="text-amber-400" />
            </div>

            {/* Entered */}
            {result.entered.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base text-emerald-400">Deals que entraram no pipeline</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {result.entered.map((s) => (
                      <div key={s.deal_id} className="flex items-center justify-between text-sm p-2 rounded bg-muted/30">
                        <span className="font-medium">{s.deal_id.slice(0, 8)}…</span>
                        <Badge variant="outline">{s.stage ?? '—'}</Badge>
                        <span>{formatCurrency(s.value_brl)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Exited */}
            {result.exited.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base text-red-400">Deals que saíram do pipeline</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {result.exited.map((s) => (
                      <div key={s.deal_id} className="flex items-center justify-between text-sm p-2 rounded bg-muted/30">
                        <span className="font-medium">{s.deal_id.slice(0, 8)}…</span>
                        <Badge variant="outline">{s.stage ?? '—'}</Badge>
                        <span>{formatCurrency(s.value_brl)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Stage changed */}
            {result.stageChanged.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base text-blue-400">Mudanças de estágio</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {result.stageChanged.map((s) => (
                      <div key={s.deal_id} className="flex items-center gap-3 text-sm p-2 rounded bg-muted/30">
                        <span className="font-medium">{s.deal_id.slice(0, 8)}…</span>
                        <Badge variant="secondary">{s.from ?? '—'}</Badge>
                        <span className="text-muted-foreground">→</span>
                        <Badge>{s.to ?? '—'}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Value changed */}
            {result.valueChanged.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base text-amber-400">Mudanças de valor</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {result.valueChanged.map((s) => (
                      <div key={s.deal_id} className="flex items-center gap-3 text-sm p-2 rounded bg-muted/30">
                        <span className="font-medium">{s.deal_id.slice(0, 8)}…</span>
                        <span className="text-muted-foreground">{formatCurrency(s.from)}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-medium">{formatCurrency(s.to)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {result.entered.length === 0 && result.exited.length === 0 &&
             result.stageChanged.length === 0 && result.valueChanged.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    Nenhuma mudança entre {dateA} e {dateB}. O pipeline ficou estável.
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function SummaryCard({ icon: Icon, label, count, color }: { icon: typeof TrendingUp; label: string; count: number; color: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <div className={`p-2 rounded-lg bg-muted/50 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{count}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
