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
import { DEAL_STAGES } from '@/types';

interface KanbanBoardProps {
  deals: Deal[];
  onDealsChange: (deals: Deal[]) => void;
  onDealMoved?: () => void;
}

export function KanbanBoard({ deals, onDealsChange, onDealMoved }: KanbanBoardProps) {
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

      const toStage = over.id as string;
      const fromStage = draggedDeal.stage_name;
      if (fromStage === toStage) return;

      // Optimistic update
      const updated = deals.map((d) =>
        d.id === draggedDeal.id ? { ...d, stage_name: toStage } : d,
      );
      onDealsChange(updated);

      try {
        await updateDeal(draggedDeal.id, { stage_name: toStage });

        // Create stage_change activity
        await createStageChangeActivity({
          dealId: draggedDeal.id,
          contactId: draggedDeal.contact_id ?? undefined,
          companyId: draggedDeal.company_id ?? undefined,
          dealTitle: draggedDeal.title,
          fromStage,
          toStage,
          createdBy: session?.user.id ?? profile?.id ?? undefined,
        });

        onDealMoved?.();
      } catch (err) {
        // Rollback
        onDealsChange(deals);
        toast.error('Erro ao mover deal: ' + (err as Error).message);
      }
    },
    [deals, onDealsChange, onDealMoved, session, profile],
  );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[400px]">
        {DEAL_STAGES.map((stage) => (
          <StageColumn
            key={stage}
            stageName={stage}
            stageId={stage}
            deals={deals.filter((d) => d.stage_name === stage)}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeDeal ? <DealCard deal={activeDeal} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
