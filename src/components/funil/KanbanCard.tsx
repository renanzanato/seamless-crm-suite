import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Building2, DollarSign, User } from 'lucide-react';
import type { Deal } from '@/services/funnelService';

interface KanbanCardProps {
  deal: Deal;
}

export function KanbanCard({ deal }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: deal.id, data: { deal } });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="bg-card border border-border rounded-lg p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow"
    >
      <p className="font-medium text-sm text-foreground truncate mb-2">{deal.name}</p>
      <div className="space-y-1">
        {deal.company && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{deal.company}</span>
          </div>
        )}
        {deal.value > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <DollarSign className="h-3 w-3 shrink-0" />
            <span>R$ {deal.value.toLocaleString('pt-BR')}</span>
          </div>
        )}
        {deal.assignee_name && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate">{deal.assignee_name}</span>
          </div>
        )}
      </div>
    </div>
  );
}
