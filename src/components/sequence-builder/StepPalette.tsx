import {
  Mail,
  Phone,
  MessageSquare,
  Linkedin,
  Clock,
  GitBranch,
  MailOpen,
} from 'lucide-react';
import { STEP_TYPE_LABELS, STEP_TYPE_COLORS } from '@/services/sequencesV2Service';
import type { StepType } from '@/services/sequencesV2Service';

const STEP_ITEMS: { type: StepType; icon: React.ElementType }[] = [
  { type: 'email_auto', icon: Mail },
  { type: 'email_manual', icon: MailOpen },
  { type: 'whatsapp_task', icon: MessageSquare },
  { type: 'call_task', icon: Phone },
  { type: 'linkedin_task', icon: Linkedin },
  { type: 'wait', icon: Clock },
  { type: 'condition', icon: GitBranch },
];

interface StepPaletteProps {
  onAddStep: (type: StepType) => void;
}

export function StepPalette({ onAddStep }: StepPaletteProps) {
  return (
    <div className="w-52 border-r border-border bg-card p-3 overflow-y-auto">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        Adicionar step
      </p>
      <div className="space-y-1.5">
        {STEP_ITEMS.map(({ type, icon: Icon }) => (
          <button
            key={type}
            onClick={() => onAddStep(type)}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-xs font-medium text-foreground hover:bg-muted transition-colors group"
          >
            <div
              className="flex h-6 w-6 items-center justify-center rounded"
              style={{
                backgroundColor: `${STEP_TYPE_COLORS[type]}15`,
                color: STEP_TYPE_COLORS[type],
              }}
            >
              <Icon className="h-3.5 w-3.5" />
            </div>
            <span className="truncate">{STEP_TYPE_LABELS[type]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
