import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface PageErrorStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onRetry?: () => void;
  compact?: boolean;
}

function errorMessage(description?: string) {
  return description || "A consulta falhou. Recarregue a tela ou tente novamente em alguns segundos.";
}

export function PageErrorState({
  title = "Nao foi possivel carregar os dados",
  description,
  actionLabel = "Tentar novamente",
  onRetry,
  compact = false,
}: PageErrorStateProps) {
  return (
    <Card className={compact ? "border-destructive/30 bg-destructive/5" : "mx-auto max-w-xl border-destructive/30 bg-destructive/5"}>
      <CardContent className={compact ? "flex items-start gap-3 p-4" : "flex flex-col items-center p-8 text-center"}>
        <div className={compact ? "mt-0.5 rounded-full bg-destructive/10 p-2 text-destructive" : "mb-3 rounded-full bg-destructive/10 p-3 text-destructive"}>
          <AlertTriangle className={compact ? "h-4 w-4" : "h-6 w-6"} />
        </div>
        <div className={compact ? "min-w-0 flex-1" : ""}>
          <h2 className={compact ? "text-sm font-semibold" : "text-base font-semibold"}>{title}</h2>
          <p className={compact ? "mt-1 text-xs text-muted-foreground" : "mt-1 text-sm text-muted-foreground"}>
            {errorMessage(description)}
          </p>
          {onRetry && (
            <Button
              type="button"
              variant="outline"
              size={compact ? "sm" : "default"}
              className={compact ? "mt-3 gap-1.5" : "mt-5 gap-2"}
              onClick={onRetry}
            >
              <RefreshCw className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
              {actionLabel}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

