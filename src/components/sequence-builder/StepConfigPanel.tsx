import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { STEP_TYPE_LABELS } from '@/services/sequencesV2Service';
import type { StepType } from '@/services/sequencesV2Service';

interface StepConfigPanelProps {
  stepId: string;
  stepType: StepType;
  config: Record<string, unknown>;
  onConfigChange: (stepId: string, config: Record<string, unknown>) => void;
  onClose: () => void;
  onDelete: (stepId: string) => void;
}

export function StepConfigPanel({
  stepId,
  stepType,
  config,
  onConfigChange,
  onClose,
  onDelete,
}: StepConfigPanelProps) {
  const update = (key: string, value: unknown) => {
    onConfigChange(stepId, { ...config, [key]: value });
  };

  return (
    <div className="w-80 border-l border-border bg-card p-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">{STEP_TYPE_LABELS[stepType]}</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4">
        {/* Email config */}
        {(stepType === 'email_auto' || stepType === 'email_manual') && (
          <>
            <div>
              <Label className="text-xs">Assunto</Label>
              <Input
                value={(config.subject_template as string) ?? ''}
                onChange={(e) => update('subject_template', e.target.value)}
                placeholder="Assunto do email"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Corpo</Label>
              <Textarea
                value={(config.body_template as string) ?? ''}
                onChange={(e) => update('body_template', e.target.value)}
                placeholder="Use {{nome}}, {{empresa}}, {{role}}..."
                className="mt-1 min-h-[120px] text-xs"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Variáveis: {'{{nome}}'}, {'{{empresa}}'}, {'{{role}}'}, {'{{custom.<field>}}'}
            </p>
          </>
        )}

        {/* WhatsApp */}
        {stepType === 'whatsapp_task' && (
          <div>
            <Label className="text-xs">Mensagem</Label>
            <Textarea
              value={(config.body_template as string) ?? ''}
              onChange={(e) => update('body_template', e.target.value)}
              placeholder="Oi {{nome}}, tudo bem? ..."
              className="mt-1 min-h-[120px] text-xs"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Variáveis: {'{{nome}}'}, {'{{empresa}}'}, {'{{role}}'}
            </p>
          </div>
        )}

        {/* Call task */}
        {stepType === 'call_task' && (
          <>
            <div>
              <Label className="text-xs">Prompt / Orientação</Label>
              <Textarea
                value={(config.prompt as string) ?? ''}
                onChange={(e) => update('prompt', e.target.value)}
                placeholder="Pergunte sobre o projeto atual..."
                className="mt-1 min-h-[80px] text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">Duração sugerida (min)</Label>
              <Input
                type="number"
                value={(config.suggested_minutes as number) ?? 15}
                onChange={(e) => update('suggested_minutes', parseInt(e.target.value) || 15)}
                className="mt-1"
              />
            </div>
          </>
        )}

        {/* LinkedIn */}
        {stepType === 'linkedin_task' && (
          <>
            <div>
              <Label className="text-xs">Ação</Label>
              <Select
                value={(config.action as string) ?? 'connect'}
                onValueChange={(v) => update('action', v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">Visualizar perfil</SelectItem>
                  <SelectItem value="connect">Enviar convite</SelectItem>
                  <SelectItem value="message">Enviar mensagem</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(config.action === 'message' || config.action === 'connect') && (
              <div>
                <Label className="text-xs">Mensagem</Label>
                <Textarea
                  value={(config.body_template as string) ?? ''}
                  onChange={(e) => update('body_template', e.target.value)}
                  placeholder="Nota de conexão..."
                  className="mt-1 min-h-[80px] text-xs"
                />
              </div>
            )}
          </>
        )}

        {/* Wait */}
        {stepType === 'wait' && (
          <>
            <div>
              <Label className="text-xs">Dias de espera</Label>
              <Input
                type="number"
                min={1}
                value={(config.days as number) ?? 1}
                onChange={(e) => update('days', parseInt(e.target.value) || 1)}
                className="mt-1"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Só horário comercial</Label>
              <Switch
                checked={(config.business_hours_only as boolean) ?? true}
                onCheckedChange={(v) => update('business_hours_only', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Parar se responder</Label>
              <Switch
                checked={(config.stop_if_replied as boolean) ?? true}
                onCheckedChange={(v) => update('stop_if_replied', v)}
              />
            </div>
          </>
        )}

        {/* Condition */}
        {stepType === 'condition' && (
          <>
            <div>
              <Label className="text-xs">Verificar</Label>
              <Select
                value={(config.check as string) ?? 'replied'}
                onValueChange={(v) => update('check', v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="replied">Respondeu</SelectItem>
                  <SelectItem value="opened">Abriu email</SelectItem>
                  <SelectItem value="clicked">Clicou em link</SelectItem>
                  <SelectItem value="meeting_booked">Reunião marcada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Saída verde = SIM, saída vermelha = NÃO.
            </p>
          </>
        )}

        {/* Delete */}
        <div className="pt-4 border-t">
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={() => onDelete(stepId)}
          >
            Remover step
          </Button>
        </div>
      </div>
    </div>
  );
}
