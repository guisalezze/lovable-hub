import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface PageTabsProps {
  pages: { id: string; name: string }[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onMove: (id: string, toIndex: number) => void;
}

/** Abas das páginas do quadro (cada página é como um quadro dentro do projeto). */
export function PageTabs({ pages, activeId, onSelect, onAdd, onRename, onDelete, onDuplicate, onMove }: PageTabsProps) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const doneRef = useRef(false);

  const startRename = (id: string, name: string) => {
    doneRef.current = false;
    setDraftName(name);
    setRenaming(id);
  };
  const finishRename = (save: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (save && renaming) onRename(renaming, draftName);
    setRenaming(null);
  };

  const index = pages.findIndex((p) => p.id === activeId);
  const active = pages[index];

  return (
    <div className="flex max-w-[60vw] items-center gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-sm backdrop-blur" role="tablist" aria-label="Páginas do quadro">
      <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
        {pages.map((p) =>
          renaming === p.id ? (
            <input
              key={p.id}
              autoFocus
              aria-label="Nome da página"
              value={draftName}
              maxLength={60}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") finishRename(true);
                if (e.key === "Escape") finishRename(false);
                e.stopPropagation();
              }}
              onBlur={() => finishRename(true)}
              className="h-7 w-32 rounded-md border border-ring bg-background px-2 text-sm outline-none"
            />
          ) : (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={p.id === activeId}
              onClick={() => onSelect(p.id)}
              onDoubleClick={() => startRename(p.id, p.name)}
              title={`${p.name} (duplo clique renomeia)`}
              className={cn(
                "h-7 max-w-[10rem] shrink-0 truncate rounded-md px-2.5 text-sm transition-colors",
                p.id === activeId ? "bg-primary/15 font-medium text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {p.name}
            </button>
          ),
        )}
      </div>

      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Nova página" title="Nova página" onClick={onAdd}>
        <Plus className="h-4 w-4" />
      </Button>

      {active ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Mais ações da página" title="Mais ações da página">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-52">
            <DropdownMenuItem onSelect={() => startRename(active.id, active.name)}>
              <Pencil className="mr-2 h-4 w-4" />
              Renomear página
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onDuplicate(active.id)}>
              <Copy className="mr-2 h-4 w-4" />
              Duplicar página
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={index <= 0} onSelect={() => onMove(active.id, index - 1)}>
              <ChevronLeft className="mr-2 h-4 w-4" />
              Mover para a esquerda
            </DropdownMenuItem>
            <DropdownMenuItem disabled={index >= pages.length - 1} onSelect={() => onMove(active.id, index + 1)}>
              <ChevronRight className="mr-2 h-4 w-4" />
              Mover para a direita
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={pages.length <= 1} className="text-destructive focus:text-destructive" onSelect={() => setConfirmDelete(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir página
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta página?</AlertDialogTitle>
            <AlertDialogDescription>{active ? `"${active.name}" e tudo que está nela serão apagados.` : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (active) onDelete(active.id);
                setConfirmDelete(false);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
