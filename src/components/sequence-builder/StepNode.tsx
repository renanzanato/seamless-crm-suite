import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import {
  Mail,
  Phone,
  MessageSquare,
  Linkedin,
  Clock,
  GitBranch,
  MailOpen,
} from 'lucide-react';
import {
  STEP_TYPE_LABELS,
  STEP_TYPE_COLORS,
} from '@/services/sequencesV2Service';
import type { StepType } from '@/services/sequencesV2Service';

const STEP_ICONS: Record<StepType, React.ElementType> = {
  email_manual: MailOpen,
  email_auto: Mail,
  call_task: Phone,
  linkedin_task: Linkedin,
  whatsapp_task: MessageSquare,
  wait: Clock,
  condition: GitBranch,
};

interface StepNodeData {
  stepType: StepType;
  position: number;
  config: Record<string, unknown>;
  label: string;
  selected?: boolean;
}

function StepNodeInner({ data, selected }: NodeProps<StepNodeData>) {
  const Icon = STEP_ICONS[data.stepType] ?? Mail;
  const color = STEP_TYPE_COLORS[data.stepType];
  const label = data.label || STEP_TYPE_LABELS[data.stepType];
  const isCondition = data.stepType === 'condition';

  return (
    <>
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-muted-foreground" />
      <div
        className={`rounded-lg border-2 bg-card px-4 py-3 min-w-[200px] max-w-[240px] shadow-sm transition-all cursor-pointer ${
          selected ? 'ring-2 ring-primary shadow-md' : 'hover:shadow-md'
        }`}
        style={{ borderColor: color }}
      >
        <div className="flex items-center gap-2 mb-1">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-md"
            style={{ backgroundColor: `${color}20`, color }}
          >
            <Icon className="h-4 w-4" />
          </div>
          <span className="text-xs font-semibold text-foreground truncate">{label}</span>
        </div>

        {/* Summary line */}
        {data.stepType === 'wait' && (
          <p className="text-[10px] text-muted-foreground mt-1">
            {(data.config?.days as number) ?? 1} dia(s)
            {data.config?.business_hours_only ? ' (horário comercial)' : ''}
          </p>
        )}
        {data.stepType === 'condition' && (
          <p className="text-[10px] text-muted-foreground mt-1">
            Se {(data.config?.check as string) ?? 'replied'}
          </p>
        )}
        {(data.stepType === 'email_auto' || data.stepType === 'email_manual') && (
          <p className="text-[10px] text-muted-foreground mt-1 truncate">
            {(data.config?.subject_template as string) || 'Sem assunto'}
          </p>
        )}
        {data.stepType === 'whatsapp_task' && (
          <p className="text-[10px] text-muted-foreground mt-1 truncate">
            {((data.config?.body_template as string) ?? '').slice(0, 40) || 'Template WhatsApp'}
          </p>
        )}
      </div>

      {/* Handles */}
      {isCondition ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            className="!w-3 !h-3 !bg-green-500 !-translate-x-6"
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            className="!w-3 !h-3 !bg-red-500 !translate-x-6"
          />
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-muted-foreground" />
      )}
    </>
  );
}

export const StepNode = memo(StepNodeInner);
