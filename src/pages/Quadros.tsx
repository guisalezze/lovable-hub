import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Copy, PenTool, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWhiteboards, type WhiteboardListItem } from "@/hooks/useWhiteboards";

export default function Quadros() {
  const navigate = useNavigate();
  const { list, create, rename, duplicate, remove } = useWhiteboards();
  const [renaming, setRenaming] = useState<WhiteboardListItem | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [deleting, setDeleting] = useState<WhiteboardListItem | null>(null);

  const boards = list.data ?? [];

  const createAndOpen = async () => {
    try {
      const board = await create.mutateAsync(undefined);
      navigate(`/quadro/${board.id}`);
    } catch {
      /* o hook já mostra o aviso de erro */
    }
  };

  const submitRename = () => {
    if (!renaming) return;
    rename.mutate({ id: renaming.id, title: newTitle });
    setRenaming(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quadros</h1>
          <p className="text-sm text-muted-foreground">Desenhe funis, estratégias e aulas num espaço sem limites.</p>
        </div>
        <Button onClick={createAndOpen} disabled={create.isPending}>
          <Plus className="mr-2 h-4 w-4" />
          Novo quadro
        </Button>
      </div>

      {list.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 rounded-lg" />
          ))}
        </div>
      ) : list.error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          Não consegui carregar os quadros. Atualize a página e tente de novo.
        </div>
      ) : boards.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
          <PenTool className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Nenhum quadro ainda</p>
          <p className="text-sm text-muted-foreground">Crie o primeiro para começar a desenhar.</p>
          <Button onClick={createAndOpen} disabled={create.isPending}>
            <Plus className="mr-2 h-4 w-4" />
            Novo quadro
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {boards.map((board) => (
            <div
              key={board.id}
              tabIndex={0}
              onClick={() => navigate(`/quadro/${board.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.target === e.currentTarget) navigate(`/quadro/${board.id}`);
              }}
              className="group cursor-pointer overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex h-28 items-center justify-center bg-muted/40">
                {board.thumbnail ? (
                  <img src={board.thumbnail} alt="" className="h-full w-full object-cover" />
                ) : (
                  <PenTool className="h-8 w-8 text-muted-foreground/60" />
                )}
              </div>
              <div className="flex items-start justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{board.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Atualizado {formatDistanceToNow(new Date(board.updated_at), { addSuffix: true, locale: ptBR })}
                  </p>
                </div>
                <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={`Renomear quadro "${board.title}"`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setNewTitle(board.title);
                      setRenaming(board);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={`Duplicar quadro "${board.title}"`}
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicate.mutate(board.id);
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    aria-label={`Excluir quadro "${board.title}"`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleting(board);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!renaming} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renomear quadro</DialogTitle>
            <DialogDescription>Escolha um nome fácil de achar depois.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitRename()}
            placeholder="Nome do quadro"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>
              Cancelar
            </Button>
            <Button onClick={submitRename}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este quadro?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? `"${deleting.title}" será apagado para todos e não dá para desfazer.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) remove.mutate(deleting.id);
                setDeleting(null);
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
