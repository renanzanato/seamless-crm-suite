import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, TrendingUp, Users, Activity, Clock } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from 'recharts';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { getProfiles } from '@/services/crmService';
import {
  getFunnelData,
  getVelocityData,
  getOwnerPerformance,
  getWeeklyActivity,
} from '@/services/reportsService';
import { useAuth } from '@/hooks/useAuth';

// ---------------------------------------------------------------------------
// Color palette (design-system friendly, dark-mode safe)
// ---------------------------------------------------------------------------
const STAGE_COLORS = [
  'hsl(220, 80%, 60%)',   // Qualificacao
  'hsl(265, 65%, 58%)',   // Proposta
  'hsl(35, 85%, 55%)',    // Negociacao
  'hsl(145, 65%, 45%)',   // Ganho
  'hsl(0, 65%, 55%)',     // Perdido
];

const ACTIVITY_COLORS: Record<string, string> = {
  note: 'hsl(220, 70%, 60%)',
  call: 'hsl(145, 65%, 50%)',
  email: 'hsl(35, 80%, 55%)',
  whatsapp: 'hsl(142, 70%, 45%)',
  task: 'hsl(265, 60%, 55%)',
  meeting: 'hsl(0, 70%, 55%)',
};

function fmtMoney(value: number) {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (value >= 1_000) return `R$ ${Math.round(value / 1_000)}k`;
  return `R$ ${value.toLocaleString('pt-BR')}`;
}

// ---------------------------------------------------------------------------
// Report page
// ---------------------------------------------------------------------------
export default function Reports() {
  const { isAdmin } = useAuth();
  const [period, setPeriod] = useState('90');
  const [ownerFilter, setOwnerFilter] = useState('__all__');

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: getProfiles,
    enabled: isAdmin,
  });

  // Queries
  const { data: funnelData, isLoading: funnelLoading } = useQuery({
    queryKey: ['report-funnel', period, ownerFilter],
    queryFn: () =>
      getFunnelData(
        parseInt(period),
        ownerFilter !== '__all__' ? ownerFilter : undefined,
      ),
  });

  const { data: velocityData, isLoading: velocityLoading } = useQuery({
    queryKey: ['report-velocity'],
    queryFn: getVelocityData,
  });

  const { data: ownerData, isLoading: ownerLoading } = useQuery({
    queryKey: ['report-owners', period],
    queryFn: () => getOwnerPerformance(parseInt(period)),
  });

  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ['report-activity'],
    queryFn: getWeeklyActivity,
  });

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold">Relatorios</h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Ultimos 30 dias</SelectItem>
              <SelectItem value="60">Ultimos 60 dias</SelectItem>
              <SelectItem value="90">Ultimos 90 dias</SelectItem>
              <SelectItem value="180">Ultimos 6 meses</SelectItem>
              <SelectItem value="365">Ultimo ano</SelectItem>
              <SelectItem value="0">Todo periodo</SelectItem>
            </SelectContent>
          </Select>

          {isAdmin && profiles.length > 0 && (
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="w-44">
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
        </div>
      </div>

      {/* Grid 2x2 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 1. Funnel */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" />
              Funil de conversao
            </CardTitle>
          </CardHeader>
          <CardContent>
            {funnelLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={funnelData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis type="number" fontSize={12} />
                  <YAxis
                    type="category"
                    dataKey="stage"
                    width={110}
                    fontSize={11}
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value: number, name: string) => [
                      name === 'count' ? `${value} deal(s)` : fmtMoney(value),
                      name === 'count' ? 'Quantidade' : 'Valor',
                    ]}
                  />
                  <Bar dataKey="count" name="count" radius={[0, 4, 4, 0]}>
                    {(funnelData ?? []).map((_, i) => (
                      <Cell key={i} fill={STAGE_COLORS[i % STAGE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            {/* Summary */}
            {funnelData && (
              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground border-t pt-3">
                <span>Total: {funnelData.reduce((s, d) => s + d.count, 0)} deals</span>
                <span>Valor: {fmtMoney(funnelData.reduce((s, d) => s + d.value, 0))}</span>
                <span>
                  Tx conv:{' '}
                  {funnelData[0]?.count
                    ? `${Math.round(((funnelData.find((d) => d.stage === 'Fechado - Ganho')?.count ?? 0) / funnelData[0].count) * 100)}%`
                    : '0%'}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 2. Velocity */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-primary" />
              Velocidade do pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            {velocityLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={velocityData} margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="stage" fontSize={10} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis fontSize={12} unit="d" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value: number) => [`${value} dias`, 'Tempo medio']}
                  />
                  <Bar dataKey="avgDays" name="Dias" fill="hsl(220, 80%, 60%)" radius={[4, 4, 0, 0]}>
                    {(velocityData ?? []).map((_, i) => (
                      <Cell key={i} fill={STAGE_COLORS[i % STAGE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            {velocityData && velocityData.length > 0 && (
              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground border-t pt-3">
                <span>
                  Ciclo total:{' '}
                  {Math.round(velocityData.reduce((s, d) => s + d.avgDays, 0))} dias
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 3. Performance por owner */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" />
              Performance por responsavel
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ownerLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : !ownerData || ownerData.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
                Sem dados de deals para o periodo.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={ownerData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis type="number" fontSize={12} />
                  <YAxis
                    type="category"
                    dataKey="ownerName"
                    width={90}
                    fontSize={11}
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend />
                  <Bar dataKey="dealsWon" name="Ganhos" fill="hsl(145, 65%, 45%)" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="dealsLost" name="Perdidos" fill="hsl(0, 65%, 55%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
            {ownerData && ownerData.length > 0 && (
              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground border-t pt-3">
                <span>Total ganho: {fmtMoney(ownerData.reduce((s, d) => s + d.totalValue, 0))}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 4. Atividade semanal */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-primary" />
              Atividade da equipe (12 semanas)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={activityData} margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="weekLabel" fontSize={10} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend />
                  <Bar dataKey="whatsapp" name="WhatsApp" stackId="a" fill={ACTIVITY_COLORS.whatsapp} />
                  <Bar dataKey="call" name="Ligacao" stackId="a" fill={ACTIVITY_COLORS.call} />
                  <Bar dataKey="email" name="Email" stackId="a" fill={ACTIVITY_COLORS.email} />
                  <Bar dataKey="note" name="Nota" stackId="a" fill={ACTIVITY_COLORS.note} />
                  <Bar dataKey="task" name="Tarefa" stackId="a" fill={ACTIVITY_COLORS.task} />
                  <Bar dataKey="meeting" name="Reuniao" stackId="a" fill={ACTIVITY_COLORS.meeting} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
            {activityData && (
              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground border-t pt-3">
                <span>
                  Total:{' '}
                  {activityData.reduce(
                    (s, w) => s + w.note + w.call + w.email + w.whatsapp + w.task + w.meeting,
                    0,
                  )}{' '}
                  atividades
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
