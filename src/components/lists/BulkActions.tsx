import { toast } from 'sonner';
import { Download, UserPlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useState } from 'react';
import type { Profile } from '@/types';

// ---------------------------------------------------------------------------
// CSV export helper
// ---------------------------------------------------------------------------
export function exportCSV(
  filename: string,
  headers: string[],
  rows: string[][],
) {
  const escape = (v: string) => {
    if (v.includes(',') || v.includes('"') || v.includes('\n')) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };
  const lines = [
    headers.map(escape).join(','),
    ...rows.map((r) => r.map(escape).join(',')),
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`${filename} exportado com sucesso.`);
}

// ---------------------------------------------------------------------------
// BulkActions
// ---------------------------------------------------------------------------
interface BulkActionsProps {
  selectedCount: number;
  profiles?: Array<Pick<Profile, 'id' | 'name'>>;
  onAssignOwner?: (ownerId: string) => Promise<void>;
  onExportCSV?: () => void;
  onDelete?: () => Promise<void>;
  onClearSelection?: () => void;
}

export function BulkActions({
  selectedCount,
  profiles = [],
  onAssignOwner,
  onExportCSV,
  onDelete,
  onClearSelection,
}: BulkActionsProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [assigning, setAssigning] = useState(false);

  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-sm animate-in slide-in-from-top-2">
      <span className="font-medium text-primary">{selectedCount} selecionado(s)</span>

      <div className="h-4 w-px bg-border mx-1" />

      {onAssignOwner && profiles.length > 0 && (
        <Select
          disabled={assigning}
          onValueChange={async (v) => {
            setAssigning(true);
            try {
              await onAssignOwner(v);
              toast.success('Responsável atribuído.');
            } catch (err: unknown) {
              toast.error((err as Error).message);
            } finally {
              setAssigning(false);
            }
          }}
        >
          <SelectTrigger className="h-7 w-auto min-w-[140px] text-xs">
            <UserPlus className="h-3 w-3 mr-1" />
            <SelectValue placeholder="Atribuir a…" />
          </SelectTrigger>
          <SelectContent>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name ?? p.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {onExportCSV && (
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onExportCSV}>
          <Download className="h-3 w-3" /> CSV
        </Button>
      )}

      {onDelete && (
        <>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-3 w-3" /> Excluir
          </Button>
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir {selectedCount} registro(s)?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação não pode ser desfeita. Os registros selecionados serão removidos permanentemente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive hover:bg-destructive/90"
                  disabled={deleting}
                  onClick={async () => {
                    setDeleting(true);
                    try {
                      await onDelete();
                      toast.success(`${selectedCount} registro(s) excluído(s).`);
                      setDeleteOpen(false);
                      onClearSelection?.();
                    } catch (err: unknown) {
                      toast.error((err as Error).message);
                    } finally {
                      setDeleting(false);
                    }
                  }}
                >
                  {deleting ? 'Excluindo…' : 'Excluir'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}

      <Button variant="ghost" size="sm" className="h-7 text-xs ml-auto" onClick={onClearSelection}>
        Limpar seleção
      </Button>
    </div>
  );
}
