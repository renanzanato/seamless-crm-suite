import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const NULL_SELECT_VALUE = '__inline_edit_null__';

export type InlineEditValue = string | number | null;
export type InlineEditVariant = 'text' | 'textarea' | 'select' | 'date' | 'number';

export interface InlineEditOption {
  label: string;
  value: string;
}

interface InlineEditProps {
  label: string;
  value: string | number | null | undefined;
  displayValue?: string;
  placeholder?: string;
  emptyLabel?: string;
  variant?: InlineEditVariant;
  options?: InlineEditOption[];
  nullable?: boolean;
  nullLabel?: string;
  disabled?: boolean;
  className?: string;
  onSave: (value: InlineEditValue) => Promise<void> | void;
}

function valueToDraft(value: string | number | null | undefined) {
  return value == null ? '' : String(value);
}

function valuesEqual(left: string | number | null | undefined, right: InlineEditValue) {
  const normalizedLeft = left == null || left === '' ? null : String(left);
  const normalizedRight = right == null || right === '' ? null : String(right);
  return normalizedLeft === normalizedRight;
}

export function InlineEdit({
  label,
  value,
  displayValue,
  placeholder = 'Nao informado',
  emptyLabel = 'Nao informado',
  variant = 'text',
  options = [],
  nullable = true,
  nullLabel = 'Limpar',
  disabled,
  className,
  onSave,
}: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(valueToDraft(value));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(valueToDraft(value));
  }, [editing, value]);

  const labelByValue = useMemo(() => new Map(options.map((option) => [option.value, option.label])), [options]);
  const shownValue =
    displayValue ??
    (value == null || value === ''
      ? emptyLabel
      : variant === 'select'
        ? labelByValue.get(String(value)) ?? String(value)
        : String(value));

  function normalize(rawDraft: string): InlineEditValue | undefined {
    const trimmed = rawDraft.trim();
    if (!trimmed) {
      if (nullable) return null;
      toast.warning(`Preencha ${label}.`);
      return undefined;
    }

    if (variant === 'number') {
      const numeric = Number(trimmed);
      if (!Number.isFinite(numeric)) {
        toast.warning(`Informe um numero valido para ${label}.`);
        return undefined;
      }
      return numeric;
    }

    if (variant === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      toast.warning(`Informe uma data valida para ${label}.`);
      return undefined;
    }

    if (variant === 'select' && !options.some((option) => option.value === trimmed)) {
      toast.warning(`Escolha uma opcao valida para ${label}.`);
      return undefined;
    }

    return trimmed;
  }

  async function commit(rawDraft = draft) {
    if (saving) return;
    const normalized = normalize(rawDraft);
    if (normalized === undefined) return;

    if (valuesEqual(value, normalized)) {
      setEditing(false);
      setDraft(valueToDraft(value));
      return;
    }

    setSaving(true);
    try {
      await onSave(normalized);
      toast.success(`${label} atualizado.`);
      setEditing(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nao foi possivel salvar.';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(valueToDraft(value));
    setEditing(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
    if (event.key === 'Enter' && (variant !== 'textarea' || event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void commit();
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        className={cn(
          'group flex w-full items-start justify-between gap-3 rounded-md px-1.5 py-1 text-left transition hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
        disabled={disabled}
        onClick={() => setEditing(true)}
      >
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="flex max-w-[62%] items-start justify-end gap-1.5 text-right text-sm font-medium">
          <span className={cn('break-words', value == null || value === '' ? 'text-muted-foreground' : '')}>
            {shownValue}
          </span>
          <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
        </span>
      </button>
    );
  }

  const selectValue = draft ? draft : NULL_SELECT_VALUE;

  return (
    <div className={cn('rounded-md border bg-background p-2 shadow-sm', className)}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {variant !== 'select' && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void commit()}
              disabled={saving}
              aria-label={`Salvar ${label}`}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onMouseDown={(event) => event.preventDefault()}
            onClick={cancel}
            disabled={saving}
            aria-label={`Cancelar ${label}`}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {variant === 'textarea' ? (
        <Textarea
          autoFocus
          value={draft}
          placeholder={placeholder}
          className="min-h-20 text-sm"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={handleKeyDown}
          disabled={saving}
        />
      ) : variant === 'select' ? (
        <Select
          value={selectValue}
          onValueChange={(nextValue) => {
            const nextDraft = nextValue === NULL_SELECT_VALUE ? '' : nextValue;
            setDraft(nextDraft);
            void commit(nextDraft);
          }}
          disabled={saving}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {nullable && <SelectItem value={NULL_SELECT_VALUE}>{nullLabel}</SelectItem>}
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          autoFocus
          type={variant === 'date' ? 'date' : variant === 'number' ? 'number' : 'text'}
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={handleKeyDown}
          disabled={saving}
        />
      )}
    </div>
  );
}
