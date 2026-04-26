import React, { useRef, useCallback, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ColumnDef<T> {
  key: string;
  header: string;
  width?: string;          // e.g. "200px", "1fr"
  minWidth?: number;
  render: (row: T) => React.ReactNode;
  sortable?: boolean;
}

export interface VirtualTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  getRowId: (row: T) => string;
  rowHeight?: number;
  maxHeight?: string;
  onRowClick?: (row: T) => void;
  // Bulk-select support
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  // Empty / loading
  isLoading?: boolean;
  emptyMessage?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function VirtualTable<T>({
  data,
  columns,
  getRowId,
  rowHeight = 44,
  maxHeight = 'calc(100vh - 300px)',
  onRowClick,
  selectable = false,
  selectedIds,
  onSelectionChange,
  isLoading = false,
  emptyMessage = 'Nenhum registro encontrado.',
}: VirtualTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 20,
  });

  const allSelected = useMemo(() => {
    if (!selectedIds || data.length === 0) return false;
    return data.every((r) => selectedIds.has(getRowId(r)));
  }, [data, selectedIds, getRowId]);

  const someSelected = useMemo(() => {
    if (!selectedIds || data.length === 0) return false;
    return data.some((r) => selectedIds.has(getRowId(r))) && !allSelected;
  }, [data, selectedIds, getRowId, allSelected]);

  const toggleAll = useCallback(() => {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(data.map(getRowId)));
    }
  }, [data, getRowId, allSelected, onSelectionChange]);

  const toggleRow = useCallback(
    (id: string) => {
      if (!onSelectionChange || !selectedIds) return;
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onSelectionChange(next);
    },
    [selectedIds, onSelectionChange],
  );

  // Grid template
  const gridTemplate = useMemo(() => {
    const parts: string[] = [];
    if (selectable) parts.push('40px');
    columns.forEach((c) => parts.push(c.width ?? '1fr'));
    return parts.join(' ');
  }, [columns, selectable]);

  if (isLoading) {
    return (
      <div className="rounded-md border">
        <div className="animate-pulse space-y-2 p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-8 rounded bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-hidden">
      {/* Header */}
      <div
        className="grid items-center gap-0 border-b bg-muted/50 px-2 text-xs font-medium text-muted-foreground"
        style={{ gridTemplateColumns: gridTemplate, height: rowHeight }}
      >
        {selectable && (
          <div className="flex items-center justify-center">
            <Checkbox
              checked={allSelected ? true : someSelected ? 'indeterminate' : false}
              onCheckedChange={toggleAll}
              aria-label="Selecionar todos"
            />
          </div>
        )}
        {columns.map((col) => (
          <div key={col.key} className="truncate px-2">
            {col.header}
          </div>
        ))}
      </div>

      {/* Body */}
      {data.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">{emptyMessage}</div>
      ) : (
        <div
          ref={parentRef}
          className="overflow-auto"
          style={{ maxHeight }}
        >
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = data[virtualRow.index];
              const id = getRowId(row);
              const isSelected = selectedIds?.has(id) ?? false;

              return (
                <div
                  key={id}
                  className={cn(
                    'grid items-center gap-0 border-b px-2 text-sm transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-muted/40',
                    isSelected && 'bg-primary/5',
                  )}
                  style={{
                    gridTemplateColumns: gridTemplate,
                    height: `${virtualRow.size}px`,
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  onClick={() => onRowClick?.(row)}
                >
                  {selectable && (
                    <div
                      className="flex items-center justify-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleRow(id)}
                        aria-label={`Selecionar ${id}`}
                      />
                    </div>
                  )}
                  {columns.map((col) => (
                    <div key={col.key} className="truncate px-2">
                      {col.render(row)}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
