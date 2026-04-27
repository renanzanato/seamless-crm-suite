import { useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { toast } from 'sonner';
import { StageColumn } from './StageColumn';
import { DealCard } from './DealCard';
import { createStageChangeActivity } from '@/services/activitiesService';
import { updateDeal } from '@/services/crmService';
import { useAuth } from '@/hooks/useAuth';
import type { Deal } from '@/types';
import type { Stage } from '@/services/funnelService';

interface KanbanBoardProps {
  stages: Stage[];
  deals: Deal[];
  onDealsChange: (deals: Deal[]) => void;
  onDealMoved?: () => void;
}

export function KanbanBoard({ stages, deals, onDealsChange, onDealMoved }: KanbanBoardProps) {
  const { session, profile } = useAuth();
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const deal = deals.find((d) => d.id === event.active.id);
      setActiveDeal(deal ?? null);
    },
    [deals],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveDeal(null);
      const { active, over } = event;
      if (!over) return;

      const draggedDeal = deals.find((d) => d.id === active.id);
      if (!draggedDeal) return;

      const toStageId = over.id as string;
      const fromStageId = draggedDeal.stage_id;
      if (fromStageId === toStageId) return;

      const toStage = stages.find((s) => s.id === toStageId);
      const fromStage = stages.find((s) => s.id === fromStageId);
      if (!toStage) return;

      const previousDeals = deals;
      const updated = deals.map((d) =>
        d.id === draggedDeal.id
          ? { ...d, stage_id: toStage.id, stage_name: toStage.name }
          : d,
      );
      onDealsChange(updated);

      try {
        await updateDeal(draggedDeal.id, { stage_id: toStage.id });

        await createStageChangeActivity({
          dealId: draggedDeal.id,
          contactId: draggedDeal.contact_id ?? undefined,
          companyId: draggedDeal.company_id ?? undefined,
          dealTitle: draggedDeal.title,
          fromStage: fromStage?.name ?? draggedDeal.stage_name ?? '',
          toStage: toStage.name,
          createdBy: session?.user.id ?? profile?.id ?? undefined,
        });

        onDealMoved?.();
      } catch (err) {
        onDealsChange(previousDeals);
        toast.error('Erro ao mover deal: ' + (err as Error).message);
      }
    },
    [deals, stages, onDealsChange, onDealMoved, session, profile],
  );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[400px]">
        {stages.map((stage) => (
          <StageColumn
            key={stage.id}
            stageName={stage.name}
            stageId={stage.id}
            deals={deals.filter((d) => d.stage_id === stage.id)}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeDeal ? <DealCard deal={activeDeal} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
