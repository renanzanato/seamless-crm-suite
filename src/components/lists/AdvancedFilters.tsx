import React, { useState, useCallback } from 'react';
import { Plus, X, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type FilterOperator =
  | 'contains'
  | 'equals'
  | 'not_equals'
  | 'starts_with'
  | 'gt'
  | 'lt'
  | 'between'
  | 'in';

export type FilterFieldType = 'text' | 'number' | 'date' | 'enum';

export interface FilterFieldDef {
  key: string;
  label: string;
  type: FilterFieldType;
  options?: Array<{ value: string; label: string }>;
}

export interface FilterCondition {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
  value2?: string; // for "between"
}

export interface FilterGroup {
  connector: 'AND' | 'OR';
  conditions: FilterCondition[];
}

interface AdvancedFiltersProps {
  fields: FilterFieldDef[];
  value: FilterGroup;
  onChange: (group: FilterGroup) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const OPERATORS_BY_TYPE: Record<FilterFieldType, { value: FilterOperator; label: string }[]> = {
  text: [
    { value: 'contains', label: 'contém' },
    { value: 'equals', label: 'igual a' },
    { value: 'not_equals', label: 'diferente de' },
    { value: 'starts_with', label: 'começa com' },
  ],
  number: [
    { value: 'equals', label: 'igual a' },
    { value: 'gt', label: 'maior que' },
    { value: 'lt', label: 'menor que' },
    { value: 'between', label: 'entre' },
  ],
  date: [
    { value: 'equals', label: 'igual a' },
    { value: 'gt', label: 'depois de' },
    { value: 'lt', label: 'antes de' },
    { value: 'between', label: 'entre' },
  ],
  enum: [
    { value: 'in', label: 'é' },
    { value: 'not_equals', label: 'não é' },
  ],
};

let _filterId = 0;
function nextId() {
  return `f-${++_filterId}-${Date.now()}`;
}

/** Apply a FilterGroup to an array of objects — pure client-side filtering. */
export function applyFilters<T extends Record<string, unknown>>(
  data: T[],
  group: FilterGroup,
): T[] {
  if (group.conditions.length === 0) return data;

  return data.filter((row) => {
    const results = group.conditions.map((cond) => {
      const raw = row[cond.field];
      const val = raw == null ? '' : String(raw).toLowerCase();
      const cv = cond.value.toLowerCase();

      switch (cond.operator) {
        case 'contains':
          return val.includes(cv);
        case 'equals':
          return val === cv;
        case 'not_equals':
          return val !== cv;
        case 'starts_with':
          return val.startsWith(cv);
        case 'gt':
          return Number(raw) > Number(cond.value);
        case 'lt':
          return Number(raw) < Number(cond.value);
        case 'between': {
          const n = Number(raw);
          return n >= Number(cond.value) && n <= Number(cond.value2 ?? cond.value);
        }
        case 'in':
          return cond.value
            .split(',')
            .map((v) => v.trim().toLowerCase())
            .includes(val);
        default:
          return true;
      }
    });

    return group.connector === 'AND'
      ? results.every(Boolean)
      : results.some(Boolean);
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function AdvancedFilters({ fields, value, onChange }: AdvancedFiltersProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const addCondition = useCallback(() => {
    const first = fields[0];
    if (!first) return;
    const ops = OPERATORS_BY_TYPE[first.type];
    const cond: FilterCondition = {
      id: nextId(),
      field: first.key,
      operator: ops[0].value,
      value: '',
    };
    onChange({ ...value, conditions: [...value.conditions, cond] });
    setEditingId(cond.id);
  }, [fields, value, onChange]);

  const removeCondition = useCallback(
    (id: string) => {
      onChange({
        ...value,
        conditions: value.conditions.filter((c) => c.id !== id),
      });
      if (editingId === id) setEditingId(null);
    },
    [value, onChange, editingId],
  );

  const updateCondition = useCallback(
    (id: string, patch: Partial<FilterCondition>) => {
      onChange({
        ...value,
        conditions: value.conditions.map((c) =>
          c.id === id ? { ...c, ...patch } : c,
        ),
      });
    },
    [value, onChange],
  );

  const toggleConnector = useCallback(() => {
    onChange({
      ...value,
      connector: value.connector === 'AND' ? 'OR' : 'AND',
    });
  }, [value, onChange]);

  const clearAll = useCallback(() => {
    onChange({ connector: 'AND', conditions: [] });
    setEditingId(null);
  }, [onChange]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {value.conditions.length > 0 && (
        <>
          {value.conditions.map((cond, i) => {
            const fieldDef = fields.find((f) => f.key === cond.field);
            const label = fieldDef?.label ?? cond.field;
            const opLabel =
              OPERATORS_BY_TYPE[fieldDef?.type ?? 'text']?.find((o) => o.value === cond.operator)
                ?.label ?? cond.operator;

            return (
              <React.Fragment key={cond.id}>
                {i > 0 && (
                  <button
                    type="button"
                    className="text-xs font-semibold text-primary hover:underline"
                    onClick={toggleConnector}
                  >
                    {value.connector}
                  </button>
                )}
                <Popover
                  open={editingId === cond.id}
                  onOpenChange={(o) => setEditingId(o ? cond.id : null)}
                >
                  <PopoverTrigger asChild>
                    <Badge
                      variant="secondary"
                      className="cursor-pointer gap-1 pr-1 hover:bg-secondary/80"
                    >
                      <span className="font-medium">{label}</span>
                      <span className="text-muted-foreground">{opLabel}</span>
                      <span>
                        {cond.operator === 'between'
                          ? `${cond.value} – ${cond.value2 ?? ''}`
                          : cond.value || '…'}
                      </span>
                      <button
                        type="button"
                        className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeCondition(cond.id);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 space-y-3 p-3">
                    <FilterEditor
                      fields={fields}
                      condition={cond}
                      onChange={(patch) => updateCondition(cond.id, patch)}
                    />
                  </PopoverContent>
                </Popover>
              </React.Fragment>
            );
          })}
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={clearAll}>
            Limpar
          </Button>
        </>
      )}
      <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={addCondition}>
        <Filter className="h-3 w-3" />
        {value.conditions.length === 0 ? 'Filtro' : 'Adicionar'}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: single filter editor
// ---------------------------------------------------------------------------
function FilterEditor({
  fields,
  condition,
  onChange,
}: {
  fields: FilterFieldDef[];
  condition: FilterCondition;
  onChange: (patch: Partial<FilterCondition>) => void;
}) {
  const fieldDef = fields.find((f) => f.key === condition.field);
  const type = fieldDef?.type ?? 'text';
  const operators = OPERATORS_BY_TYPE[type];

  return (
    <>
      <Select
        value={condition.field}
        onValueChange={(f) => {
          const newField = fields.find((fd) => fd.key === f);
          const newType = newField?.type ?? 'text';
          const newOps = OPERATORS_BY_TYPE[newType];
          onChange({
            field: f,
            operator: newOps[0].value,
            value: '',
            value2: undefined,
          });
        }}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {fields.map((f) => (
            <SelectItem key={f.key} value={f.key}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={condition.operator}
        onValueChange={(op) => onChange({ operator: op as FilterOperator })}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {operators.map((op) => (
            <SelectItem key={op.value} value={op.value}>
              {op.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {type === 'enum' && fieldDef?.options ? (
        <Select value={condition.value} onValueChange={(v) => onChange({ value: v })}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Selecione…" />
          </SelectTrigger>
          <SelectContent>
            {fieldDef.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <>
          <Input
            type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
            value={condition.value}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder={type === 'date' ? 'yyyy-mm-dd' : 'Valor…'}
            className="h-8 text-xs"
          />
          {condition.operator === 'between' && (
            <Input
              type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
              value={condition.value2 ?? ''}
              onChange={(e) => onChange({ value2: e.target.value })}
              placeholder="Até…"
              className="h-8 text-xs"
            />
          )}
        </>
      )}
    </>
  );
}
