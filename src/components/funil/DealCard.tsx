import { useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { DollarSign, Clock, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Deal } from '@/types';

interface DealCardProps {
  deal: Deal;
}

function fmtMoney(value: number | null) {
  if (!value) return null;
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}k`;
  return `R$ ${value.toLocaleString('pt-BR')}`;
}

function daysInStage(createdAt: string): number {
  const created = new Date(createdAt);
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)));
}

function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export function DealCard({ deal }: DealCardProps) {
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: deal.id, data: { deal } });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  const days = useMemo(() => daysInStage(deal.created_at), [deal.created_at]);
  const moneyStr = useMemo(() => fmtMoney(deal.value), [deal.value]);
  const ownerInitials = useMemo(() => getInitials(deal.owner?.name), [deal.owner?.name]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="bg-card border border-border rounded-lg p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-all hover:border-primary/30 group"
      onClick={(e) => {
        // Only navigate if not dragging
        if (!isDragging) {
          e.stopPropagation();
          navigate(`/crm/negocios/${deal.id}`);
        }
      }}
    >
      {/* Title */}
      <p className="font-medium text-sm text-foreground truncate mb-2 group-hover:text-primary transition-colors">
        {deal.title}
      </p>

      {/* Company / Contact */}
      {(deal.company?.name || deal.contact?.name) && (
        <p className="text-xs text-muted-foreground truncate mb-2">
          {deal.company?.name}
          {deal.company?.name && deal.contact?.name && ' · '}
          {deal.contact?.name}
        </p>
      )}

      {/* Bottom row: value, days, owner */}
      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-3">
          {moneyStr && (
            <div className="flex items-center gap-1 text-xs font-medium text-emerald-600">
              <DollarSign className="h-3 w-3" />
              <span>{moneyStr}</span>
            </div>
          )}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{days}d</span>
          </div>
        </div>

        {/* Owner avatar */}
        <div
          className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold"
          title={deal.owner?.name ?? 'Sem dono'}
        >
          {ownerInitials}
        </div>
      </div>
    </div>
  );
}
