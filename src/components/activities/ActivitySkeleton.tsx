import { cn } from "@/lib/utils";

// ────────────────────────────────────────────────────────────
// ActivitySkeleton — placeholder pulsante que bate com a
// estrutura visual de ItemShell (timeline dot + card).
// Usado pelo ActivityTimeline enquanto a query carrega.
// ────────────────────────────────────────────────────────────

interface Props {
  count?: number;
}

function GhostItem() {
  return (
    <div className="mb-3 flex gap-3">
      <div className="flex w-8 shrink-0 flex-col items-center">
        <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
        <div className="mt-1 w-px flex-1 bg-border" />
      </div>
      <div className="flex-1 rounded-md border bg-card p-3 shadow-sm">
        <div className="mb-1 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className={cn("h-3.5 w-40 animate-pulse rounded bg-muted")} />
            <div className={cn("h-2.5 w-24 animate-pulse rounded bg-muted/60")} />
          </div>
          <div className="space-y-1 text-right">
            <div className="h-2.5 w-16 animate-pulse rounded bg-muted/60" />
            <div className="h-2.5 w-10 animate-pulse rounded bg-muted/60" />
          </div>
        </div>
        <div className="mt-2 space-y-1.5">
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}

export function ActivitySkeleton({ count = 5 }: Props) {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <GhostItem key={i} />
      ))}
    </div>
  );
}
