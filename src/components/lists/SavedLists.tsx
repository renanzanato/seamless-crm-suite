import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookmarkPlus, ChevronDown, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getSavedLists,
  createSavedList,
  deleteSavedList,
  type SavedList,
} from '@/services/listsService';
import type { FilterGroup } from '@/components/lists/AdvancedFilters';

interface SavedListsProps {
  entity: SavedList['entity'];
  ownerId: string;
  currentFilters: FilterGroup;
  currentColumns: string[];
  onLoad: (filters: FilterGroup, columns: string[] | null) => void;
}

export function SavedLists({
  entity,
  ownerId,
  currentFilters,
  currentColumns,
  onLoad,
}: SavedListsProps) {
  const qc = useQueryClient();
  const [saveOpen, setSaveOpen] = useState(false);
  const [listName, setListName] = useState('');

  const { data: lists = [] } = useQuery({
    queryKey: ['saved-lists', entity],
    queryFn: () => getSavedLists(entity),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      createSavedList({
        name,
        entity,
        owner_id: ownerId,
        filters: currentFilters,
        columns: currentColumns,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-lists', entity] });
      toast.success('Lista salva!');
      setSaveOpen(false);
      setListName('');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSavedList,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-lists', entity] });
      toast.success('Lista removida.');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleLoad(list: SavedList) {
    const filters = list.filters as FilterGroup;
    onLoad(filters, list.columns);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <BookmarkPlus className="h-4 w-4" />
            Listas
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {lists.length === 0 && (
            <div className="px-2 py-3 text-xs text-muted-foreground text-center">
              Nenhuma lista salva.
            </div>
          )}
          {lists.map((list) => (
            <DropdownMenuItem
              key={list.id}
              className="flex items-center justify-between"
              onClick={() => handleLoad(list)}
            >
              <span className="truncate">{list.name}</span>
              <button
                type="button"
                className="ml-2 p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteMutation.mutate(list.id);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setSaveOpen(true)}>
            <BookmarkPlus className="h-4 w-4 mr-2" />
            Salvar lista atual
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Salvar lista</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              placeholder="Nome da lista…"
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && listName.trim()) {
                  createMutation.mutate(listName.trim());
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!listName.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate(listName.trim())}
            >
              {createMutation.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
