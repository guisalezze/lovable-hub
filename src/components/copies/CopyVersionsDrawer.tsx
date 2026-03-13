import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCopyItemVersions } from "@/hooks/useCopyItems";
import { Skeleton } from "@/components/ui/skeleton";
import { RotateCcw } from "lucide-react";

interface CopyVersionsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  copyItemId: string | undefined;
  onRestore: (content: string) => void;
}

export function CopyVersionsDrawer({ open, onOpenChange, copyItemId, onRestore }: CopyVersionsDrawerProps) {
  const { data: versions, isLoading } = useCopyItemVersions(open ? copyItemId : undefined);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Histórico de Versões</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-100px)] mt-4">
          {isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 mb-3" />)}
          {!isLoading && !versions?.length && (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma versão salva ainda</p>
          )}
          <div className="space-y-3 pr-2">
            {versions?.map((v) => (
              <div key={v.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {new Date(v.created_at).toLocaleString("pt-BR")}
                  </span>
                  <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => onRestore(v.content)}>
                    <RotateCcw className="h-3 w-3" /> Restaurar
                  </Button>
                </div>
                <pre className="text-xs bg-muted p-2 rounded max-h-32 overflow-y-auto whitespace-pre-wrap">{v.content}</pre>
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
