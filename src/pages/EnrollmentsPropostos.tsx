import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, RefreshCw, SendHorizontal, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { DashboardLayout } from '@/components/DashboardLayout';
import { PageErrorState } from '@/components/states/PageState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  acceptProposedEnrollment,
  generateProposedEnrollments,
  getProposedEnrollments,
  rejectProposedEnrollment,
  type ProposedEnrollment,
} from '@/services/abmService';

export default function EnrollmentsPropostos() {
  const qc = useQueryClient();
  const {
    data: proposals = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['proposed-enrollments'],
    queryFn: () => getProposedEnrollments(100),
  });

  const generateMutation = useMutation({
    mutationFn: () => generateProposedEnrollments(50),
    onSuccess: (result) => {
      toast.success(`${result.created} sugestao(oes) gerada(s).`);
      qc.invalidateQueries({ queryKey: ['proposed-enrollments'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const acceptMutation = useMutation({
    mutationFn: acceptProposedEnrollment,
    onSuccess: () => {
      toast.success('Enrollment aceito e cadencia iniciada.');
      qc.invalidateQueries({ queryKey: ['proposed-enrollments'] });
      qc.invalidateQueries({ queryKey: ['cadence-tracks'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rejectMutation = useMutation({
    mutationFn: rejectProposedEnrollment,
    onSuccess: () => {
      toast.success('Sugestao rejeitada.');
      qc.invalidateQueries({ queryKey: ['proposed-enrollments'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isError) {
    return (
      <DashboardLayout>
        <PageErrorState
          title="Nao foi possivel carregar os enrollments propostos"
          description={(error as Error).message}
          onRetry={() => void refetch()}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Enrollments Propostos</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sugestoes do sistema para preencher o pace diario sem colocar contato suprimido em cadencia.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar
            </Button>
            <Button
              size="sm"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              className="gap-1.5"
            >
              {generateMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <SendHorizontal className="h-3.5 w-3.5" />
              )}
              Gerar sugestoes
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-28 animate-pulse rounded-lg bg-muted/50" />
            ))}
          </div>
        ) : proposals.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <CheckCircle2 className="mb-3 h-10 w-10 text-emerald-400" />
              <p className="text-sm text-muted-foreground">Nenhuma sugestao pendente.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {proposals.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                accepting={acceptMutation.isPending}
                rejecting={rejectMutation.isPending}
                onAccept={() => acceptMutation.mutate(proposal.id)}
                onReject={() => rejectMutation.mutate(proposal.id)}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function ProposalCard({
  proposal,
  accepting,
  rejecting,
  onAccept,
  onReject,
}: {
  proposal: ProposedEnrollment;
  accepting: boolean;
  rejecting: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const contact = proposal.contact;
  const sequence = proposal.sequence;
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">
              {contact?.name ?? 'Contato sem nome'}
            </h2>
            <Badge variant="secondary">Prioridade {proposal.priority ?? 0}</Badge>
            {contact?.company?.name && <Badge variant="outline">{contact.company.name}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            Sequencia: <span className="text-foreground">{sequence?.name ?? proposal.sequence_id}</span>
          </p>
          <p className="text-sm text-muted-foreground">{proposal.reason}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onReject}
            disabled={rejecting || accepting}
            className="gap-1.5"
          >
            <XCircle className="h-3.5 w-3.5" /> Rejeitar
          </Button>
          <Button
            size="sm"
            onClick={onAccept}
            disabled={accepting || rejecting}
            className="gap-1.5"
          >
            {accepting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Aceitar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
