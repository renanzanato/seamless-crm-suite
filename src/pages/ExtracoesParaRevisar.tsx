import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileSearch, Check, X, RefreshCw, AlertTriangle, Sparkles } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { returnEmptyOnOptionalSchema } from '@/lib/supabaseOptional';

const EXTRACTION_LABELS: Record<string, string> = {
  next_step: 'Próximo passo',
  decision_maker_mentioned: 'Decisor mencionado',
  objection: 'Objeção',
  price_quoted: 'Preço cotado',
  date_agreed: 'Data combinada',
  competitor_mentioned: 'Concorrente',
  pain_point: 'Ponto de dor',
  budget_signal: 'Sinal de orçamento',
  timeline_signal: 'Sinal de prazo',
};

const RISK_COLORS: Record<string, string> = {
  low: 'bg-emerald-500/15 text-emerald-400',
  medium: 'bg-yellow-500/15 text-yellow-400',
  high: 'bg-red-500/15 text-red-400',
};

interface Extraction {
  id: string;
  activity_id: string;
  deal_id: string | null;
  contact_id: string | null;
  extraction_type: string;
  payload: Record<string, unknown>;
  confidence: number;
  risk_level: string;
  status: string;
  created_at: string;
}

async function getPendingExtractions(): Promise<Extraction[]> {
  const { data, error } = await supabase
    .from('conversation_extractions')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return returnEmptyOnOptionalSchema(error, []);
  return (data ?? []) as Extraction[];
}

async function resolveExtraction(id: string, status: 'approved' | 'rejected'): Promise<void> {
  const { error } = await supabase
    .from('conversation_extractions')
    .update({
      status,
      reviewed_at: new Date().toISOString(),
      applied_at: status === 'approved' ? new Date().toISOString() : null,
    })
    .eq('id', id);
  if (error) throw error;
}

export default function ExtracoesParaRevisar() {
  const qc = useQueryClient();

  const { data: extractions = [], isLoading, refetch } = useQuery({
    queryKey: ['pending-extractions'],
    queryFn: getPendingExtractions,
  });

  const resolveMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'approved' | 'rejected' }) =>
      resolveExtraction(id, status),
    onSuccess: (_, { status }) => {
      qc.invalidateQueries({ queryKey: ['pending-extractions'] });
      toast.success(status === 'approved' ? 'Extração aprovada e aplicada.' : 'Extração rejeitada.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const byRisk = {
    high: extractions.filter((e) => e.risk_level === 'high'),
    medium: extractions.filter((e) => e.risk_level === 'medium'),
    low: extractions.filter((e) => e.risk_level === 'low'),
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Extrações para Revisar</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Fatos extraídos de conversas que precisam de validação humana. Low-risk são auto-aplicados.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <Sparkles className="h-3 w-3" />
              {extractions.length} pendentes
            </Badge>
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar
            </Button>
          </div>
        </div>

        {/* Risk summary */}
        <div className="grid grid-cols-3 gap-3">
          {(['high', 'medium', 'low'] as const).map((risk) => (
            <Card key={risk} className="text-center">
              <CardContent className="py-4">
                <p className="text-2xl font-bold">{byRisk[risk].length}</p>
                <Badge className={`text-xs mt-1 ${RISK_COLORS[risk]}`}>
                  {risk === 'high' ? 'Alto risco' : risk === 'medium' ? 'Médio' : 'Baixo'}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-muted/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : extractions.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Check className="h-10 w-10 text-emerald-400 mb-3" />
              <p className="text-sm text-muted-foreground">Todas as extrações foram revisadas!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {extractions.map((ext) => (
              <Card key={ext.id} className="overflow-hidden">
                <div className="flex flex-col sm:flex-row">
                  <div className="flex-1 p-4 space-y-2 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <FileSearch className="h-4 w-4 text-muted-foreground shrink-0" />
                      <Badge className={`text-xs border ${RISK_COLORS[ext.risk_level]}`}>
                        {EXTRACTION_LABELS[ext.extraction_type] ?? ext.extraction_type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {Math.round(ext.confidence * 100)}% confiança
                      </span>
                      {ext.risk_level === 'high' && (
                        <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                      )}
                    </div>
                    <pre className="text-xs text-muted-foreground bg-muted/30 rounded p-2 overflow-x-auto">
                      {JSON.stringify(ext.payload, null, 2)}
                    </pre>
                    <p className="text-xs text-muted-foreground">
                      {new Date(ext.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 p-4 border-t sm:border-t-0 sm:border-l bg-muted/20">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                      disabled={resolveMut.isPending}
                      onClick={() => resolveMut.mutate({ id: ext.id, status: 'approved' })}
                    >
                      <Check className="h-3.5 w-3.5" /> Aprovar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-red-400 border-red-500/30 hover:bg-red-500/10"
                      disabled={resolveMut.isPending}
                      onClick={() => resolveMut.mutate({ id: ext.id, status: 'rejected' })}
                    >
                      <X className="h-3.5 w-3.5" /> Rejeitar
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
