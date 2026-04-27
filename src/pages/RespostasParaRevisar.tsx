import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  MessageCircle, Filter, CheckCircle2, RefreshCw,
} from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  getClassifiedActivities,
  overrideClassification,
  type ClassifiedActivity,
} from '@/services/replyIntelService';
import type { ReplyClassification } from '@/types';
import {
  REPLY_CLASSIFICATIONS,
  REPLY_CLASSIFICATION_LABELS,
} from '@/types';

const CLASS_COLORS: Record<ReplyClassification, string> = {
  positive_intent: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  meeting_requested: 'bg-green-500/15 text-green-400 border-green-500/30',
  not_now: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  not_interested: 'bg-red-500/15 text-red-400 border-red-500/30',
  out_of_office: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  wrong_person: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  referral: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  unsubscribe_request: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  unclear: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

export default function RespostasParaRevisar() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<ReplyClassification | 'all'>('all');

  const { data: activities = [], isLoading, refetch } = useQuery({
    queryKey: ['classified-activities', filter],
    queryFn: () =>
      getClassifiedActivities(filter === 'all' ? undefined : filter, 100),
  });

  const overrideMut = useMutation({
    mutationFn: ({ id, cls }: { id: string; cls: ReplyClassification }) =>
      overrideClassification(id, cls, ''),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['classified-activities'] });
      toast.success('Classificação atualizada.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const countByClass = REPLY_CLASSIFICATIONS.reduce(
    (acc, cls) => {
      acc[cls] = activities.filter((a) => a.reply_classification === cls).length;
      return acc;
    },
    {} as Record<ReplyClassification, number>,
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Respostas para Revisar</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Classifique respostas inbound. Override manual nunca é sobrescrito pela IA.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar
            </Button>
          </div>
        </div>

        {/* Class pills */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filter === 'all'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
            }`}
          >
            Todas ({activities.length})
          </button>
          {REPLY_CLASSIFICATIONS.map((cls) => (
            <button
              key={cls}
              type="button"
              onClick={() => setFilter(cls)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                filter === cls
                  ? CLASS_COLORS[cls]
                  : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
              }`}
            >
              {REPLY_CLASSIFICATION_LABELS[cls]} ({countByClass[cls]})
            </button>
          ))}
        </div>

        {/* Activity list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-muted/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : activities.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <CheckCircle2 className="h-10 w-10 text-emerald-400 mb-3" />
              <p className="text-sm text-muted-foreground">Nenhuma resposta pendente de revisão!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {activities.map((a) => (
              <ActivityCard
                key={a.id}
                activity={a}
                onOverride={(cls) => overrideMut.mutate({ id: a.id, cls })}
                isPending={overrideMut.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function ActivityCard({
  activity,
  onOverride,
  isPending,
}: {
  activity: ClassifiedActivity;
  onOverride: (cls: ReplyClassification) => void;
  isPending: boolean;
}) {
  const cls = activity.reply_classification;
  const conf = activity.classification_confidence;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        <div className="flex-1 p-4 space-y-2 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <MessageCircle className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium truncate">
              {activity.contact?.name ?? 'Contato desconhecido'}
            </span>
            {activity.deal && (
              <Badge variant="outline" className="text-xs">{activity.deal.title}</Badge>
            )}
            {cls && (
              <Badge className={`text-xs border ${CLASS_COLORS[cls]}`}>
                {REPLY_CLASSIFICATION_LABELS[cls]}
              </Badge>
            )}
            {conf != null && (
              <span className="text-xs text-muted-foreground">
                {Math.round(conf * 100)}% conf.
              </span>
            )}
            {activity.classified_by === 'human' && (
              <Badge variant="secondary" className="text-[10px]">Manual</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {activity.body || '(sem corpo)'}
          </p>
          <p className="text-xs text-muted-foreground">
            {new Date(activity.created_at).toLocaleString('pt-BR')}
          </p>
        </div>
        <div className="flex items-center gap-2 p-4 border-t sm:border-t-0 sm:border-l bg-muted/20">
          <Select
            value=""
            onValueChange={(v) => onOverride(v as ReplyClassification)}
            disabled={isPending}
          >
            <SelectTrigger className="h-8 w-44 text-xs">
              <Filter className="h-3 w-3 mr-1" />
              <SelectValue placeholder="Reclassificar…" />
            </SelectTrigger>
            <SelectContent>
              {REPLY_CLASSIFICATIONS.map((c) => (
                <SelectItem key={c} value={c}>{REPLY_CLASSIFICATION_LABELS[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </Card>
  );
}
