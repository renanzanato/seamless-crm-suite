import { useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { DealCard } from './DealCard';
import type { Deal } from '@/types';

interface StageColumnProps {
  stageName: string;
  stageId: string;
  deals: Deal[];
}

function fmtMoney(value: number) {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}k`;
  return `R$ ${value.toLocaleString('pt-BR')}`;
}

export function StageColumn({ stageName, stageId, deals }: StageColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stageId });

  const totalValue = useMemo(
    () => deals.reduce((sum, d) => sum + (d.value ?? 0), 0),
    [deals],
  );

  return (
    <div className="flex flex-col min-w-[280px] max-w-[280px]">
      {/* Header */}
      <div className="mb-3 px-1">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider truncate">
            {stageName}
          </h3>
          <span className="text-xs font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5 shrink-0">
            {deals.length}
          </span>
        </div>
        {totalValue > 0 && (
          <p className="text-xs font-medium text-emerald-600 tabular-nums">
            {fmtMoney(totalValue)}
          </p>
        )}
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[200px] rounded-lg p-2 space-y-2 border-2 transition-colors overflow-y-auto max-h-[calc(100vh-280px)] ${
          isOver
            ? 'bg-primary/10 border-primary/40'
            : 'bg-muted/30 border-transparent'
        }`}
      >
        {deals.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
            Arraste deals aqui
          </div>
        )}
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} />
        ))}
      </div>
    </div>
  );
}
