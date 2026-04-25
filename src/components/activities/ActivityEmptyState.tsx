import { MessageSquare, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";

// ────────────────────────────────────────────────────────────
// ActivityEmptyState — shown by ActivityTimeline when there
// are zero activities for the current scope. Provides a clear
// CTA to add the first note when a handler is available.
// ────────────────────────────────────────────────────────────

interface Props {
  hint: string;
  onAddNote?: () => void;
}

export function ActivityEmptyState({ hint, onAddNote }: Props) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/5">
        <MessageSquare className="h-8 w-8 text-primary/60" />
      </div>
      <h3 className="text-base font-semibold">Nada por aqui ainda</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>
      {onAddNote && (
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onAddNote}>
          <StickyNote className="h-4 w-4" />
          Adicionar primeira nota
        </Button>
      )}
    </div>
  );
}
