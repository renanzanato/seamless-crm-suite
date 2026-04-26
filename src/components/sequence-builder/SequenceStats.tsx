import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';
import {
  getSequenceStats,
  STEP_TYPE_LABELS,
  STEP_TYPE_COLORS,
} from '@/services/sequencesV2Service';

interface SequenceStatsProps {
  sequenceId: string;
}

export function SequenceStats({ sequenceId }: SequenceStatsProps) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['sequence-stats', sequenceId],
    queryFn: () => getSequenceStats(sequenceId),
    enabled: !!sequenceId,
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!stats || stats.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        Sem dados de execução ainda.
      </div>
    );
  }

  const chartData = stats.map((s) => ({
    name: `${s.position + 1}. ${STEP_TYPE_LABELS[s.stepType]}`,
    Enviados: s.sent,
    Abertos: s.opened,
    Clicados: s.clicked,
    Respondidos: s.replied,
    Falhados: s.failed,
    color: STEP_TYPE_COLORS[s.stepType],
  }));

  // Funnel conversion
  const totalSent = stats.reduce((s, st) => s + st.sent, 0);
  const totalReplied = stats.reduce((s, st) => s + st.replied, 0);
  const conversionRate = totalSent > 0 ? Math.round((totalReplied / totalSent) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{totalSent}</p>
            <p className="text-xs text-muted-foreground">Enviados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-blue-500">
              {stats.reduce((s, st) => s + st.opened, 0)}
            </p>
            <p className="text-xs text-muted-foreground">Abertos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-green-500">{totalReplied}</p>
            <p className="text-xs text-muted-foreground">Respondidos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-primary">{conversionRate}%</p>
            <p className="text-xs text-muted-foreground">Conversão</p>
          </CardContent>
        </Card>
      </div>

      {/* Funnel chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <TrendingUp className="h-4 w-4 text-primary" />
            Performance por step
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="name" fontSize={10} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
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
              <Bar dataKey="Enviados" fill="hsl(220, 70%, 60%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Abertos" fill="hsl(200, 70%, 55%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Respondidos" fill="hsl(145, 65%, 45%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Falhados" fill="hsl(0, 65%, 55%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
