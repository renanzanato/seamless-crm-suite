import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  User,
  Building2,
  Briefcase,
  Loader2,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { globalSearch } from '@/services/searchService';
import type { SearchResultType } from '@/services/searchService';

const TYPE_ICONS: Record<SearchResultType, React.ElementType> = {
  contact: User,
  company: Building2,
  deal: Briefcase,
};

const TYPE_LABELS: Record<SearchResultType, string> = {
  contact: 'Contato',
  company: 'Empresa',
  deal: 'Negócio',
};

const TYPE_COLORS: Record<SearchResultType, string> = {
  contact: 'text-blue-500',
  company: 'text-emerald-500',
  deal: 'text-amber-500',
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  // Global shortcut ⌘F or Ctrl+F
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  const { data: results = [], isLoading } = useQuery({
    queryKey: ['global-search', query],
    queryFn: () => globalSearch(query),
    enabled: query.length >= 2,
    staleTime: 2000,
  });

  const handleSelect = useCallback(
    (link: string) => {
      setOpen(false);
      navigate(link);
    },
    [navigate],
  );

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex].link);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  // Group by type
  const grouped = results.reduce(
    (acc, r) => {
      (acc[r.type] ??= []).push(r);
      return acc;
    },
    {} as Record<string, typeof results>,
  );

  let flatIndex = -1;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 max-w-lg overflow-hidden gap-0">
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Buscar contatos, empresas, negócios..."
            className="border-none shadow-none focus-visible:ring-0 h-8 px-0 text-sm"
          />
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {query && (
            <button onClick={() => setQuery('')}>
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>

        {/* Results */}
        <div className="max-h-[360px] overflow-y-auto">
          {query.length >= 2 && results.length === 0 && !isLoading && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nenhum resultado para "{query}"
            </div>
          )}

          {query.length < 2 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <p>
                <kbd className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono border">⌘</kbd>{' '}
                <kbd className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono border">F</kbd>{' '}
                para buscar
              </p>
              <p className="mt-1 text-xs">
                Use ↑↓ para navegar, Enter para selecionar
              </p>
            </div>
          )}

          {Object.entries(grouped).map(([type, items]) => {
            const Icon = TYPE_ICONS[type as SearchResultType];
            const label = TYPE_LABELS[type as SearchResultType];
            return (
              <div key={type}>
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30">
                  {label}
                </div>
                {items.map((r) => {
                  flatIndex++;
                  const idx = flatIndex;
                  const isSelected = idx === selectedIndex;
                  return (
                    <button
                      key={r.id}
                      onClick={() => handleSelect(r.link)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                        isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 ${TYPE_COLORS[type as SearchResultType]}`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{r.title}</p>
                        {r.subtitle && (
                          <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <div className="px-3 py-2 border-t text-[10px] text-muted-foreground flex items-center gap-3">
            <span>
              <kbd className="bg-muted px-1 py-0.5 rounded font-mono border">↑↓</kbd> navegar
            </span>
            <span>
              <kbd className="bg-muted px-1 py-0.5 rounded font-mono border">↵</kbd> selecionar
            </span>
            <span>
              <kbd className="bg-muted px-1 py-0.5 rounded font-mono border">esc</kbd> fechar
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
