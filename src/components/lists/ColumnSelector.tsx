import React, { useState, useEffect } from 'react';
import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export interface ColumnOption {
  key: string;
  label: string;
  defaultVisible?: boolean;
}

interface ColumnSelectorProps {
  storageKey: string;
  columns: ColumnOption[];
  onChange: (visibleKeys: string[]) => void;
}

function getDefaultVisible(columns: ColumnOption[]): string[] {
  return columns.filter((c) => c.defaultVisible !== false).map((c) => c.key);
}

export function ColumnSelector({ storageKey, columns, onChange }: ColumnSelectorProps) {
  const [visible, setVisible] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        // Filter out any stale keys
        return parsed.filter((k) => columns.some((c) => c.key === k));
      }
    } catch { /* ignore */ }
    return getDefaultVisible(columns);
  });

  useEffect(() => {
    onChange(visible);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(key: string) {
    setVisible((prev) => {
      const next = prev.includes(key)
        ? prev.filter((k) => k !== key)
        : [...prev, key];
      // Must have at least 1 column
      if (next.length === 0) return prev;
      localStorage.setItem(storageKey, JSON.stringify(next));
      onChange(next);
      return next;
    });
  }

  function resetDefaults() {
    const def = getDefaultVisible(columns);
    setVisible(def);
    localStorage.setItem(storageKey, JSON.stringify(def));
    onChange(def);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Settings2 className="h-4 w-4" />
          Colunas
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {columns.map((col) => (
            <label
              key={col.key}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted cursor-pointer"
            >
              <Checkbox
                checked={visible.includes(col.key)}
                onCheckedChange={() => toggle(col.key)}
              />
              {col.label}
            </label>
          ))}
        </div>
        <div className="border-t mt-2 pt-2">
          <Button variant="ghost" size="sm" className="w-full text-xs" onClick={resetDefaults}>
            Restaurar padrão
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
