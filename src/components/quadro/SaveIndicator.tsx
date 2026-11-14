import { AlertTriangle, Check, Loader2 } from "lucide-react";
import type { SaveStatus } from "@/lib/whiteboard/autosave";
import { cn } from "@/lib/utils";

const LABELS: Record<SaveStatus, string> = {
  saved: "Salvo",
  saving: "Salvando…",
  error: "Erro ao salvar",
  conflict: "Conflito",
};

export function SaveIndicator({ status }: { status: SaveStatus }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-xs",
        status === "saved" && "text-muted-foreground",
        status === "saving" && "text-muted-foreground",
        (status === "error" || status === "conflict") && "font-medium text-destructive",
      )}
    >
      {status === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {status === "saved" && <Check className="h-3.5 w-3.5" />}
      {(status === "error" || status === "conflict") && <AlertTriangle className="h-3.5 w-3.5" />}
      {LABELS[status]}
    </span>
  );
}
