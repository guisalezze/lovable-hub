import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Whiteboard } from "@/components/quadro/Whiteboard";
import { SaveIndicator } from "@/components/quadro/SaveIndicator";
import { useWhiteboard } from "@/hooks/useWhiteboards";
import { clearDraft, fetchUpdatedAt, loadDraft, saveDraft, saveScene, saveTitle, type WhiteboardRow } from "@/lib/whiteboard/api";
import { createAutosaver, type Autosaver, type SaveStatus } from "@/lib/whiteboard/autosave";
import { parseScene } from "@/lib/whiteboard/scene";
import type { WbElement } from "@/lib/whiteboard/types";

// O quadro ocupa toda a área da página, por cima do preenchimento do layout do CRM.
const FRAME = "-m-3 h-[calc(100vh-3rem)] sm:-m-4 md:-m-6 md:h-[calc(100vh-3.5rem)]";

function Message({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <AlertTriangle className="h-8 w-8 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      {detail ? <p className="max-w-md text-sm text-muted-foreground">{detail}</p> : null}
      <Button asChild variant="outline">
        <Link to="/quadro">Voltar para os quadros</Link>
      </Button>
    </div>
  );
}

export default function QuadroEditor() {
  const { id } = useParams();
  const { data, isLoading, error } = useWhiteboard(id);

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !data) return <Message title="Não encontrei este quadro" detail="Ele pode ter sido excluído, ou você não tem acesso." />;

  // Formato desconhecido ou corrompido: mostra o motivo e NÃO abre o editor,
  // para o autosave nunca gravar por cima do que está no banco.
  const parsed = parseScene(data.scene);
  if (!("elements" in parsed)) return <Message title="Não consegui abrir este quadro" detail={parsed.error} />;

  return <LoadedEditor key={data.id} row={data} elements={parsed.elements} />;
}

function LoadedEditor({ row, elements }: { row: WhiteboardRow; elements: WbElement[] }) {
  const queryClient = useQueryClient();

  // rascunho local mais novo que o banco = alterações que não chegaram a ser salvas
  const [draft] = useState(() => loadDraft(row.id));
  const usingDraft = !!draft && draft.savedAt > new Date(row.updated_at).getTime();
  const [initial] = useState<WbElement[]>(() => (usingDraft && draft ? draft.elements : elements));

  const expectedRef = useRef(row.updated_at);
  const latestRef = useRef<WbElement[]>(initial);
  const saverRef = useRef<Autosaver<WbElement[]> | null>(null);
  const statusRef = useRef<SaveStatus>("saved");
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const savedTitleRef = useRef(row.title);

  const [status, setStatusState] = useState<SaveStatus>("saved");
  const [title, setTitle] = useState(row.title);

  const setStatus = useCallback((s: SaveStatus) => {
    statusRef.current = s;
    setStatusState(s);
  }, []);

  // Gravações em fila: cena e título usam o mesmo updated_at esperado, então não podem correr juntas.
  const enqueue = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const run = queueRef.current.then(fn, fn);
    queueRef.current = run.catch(() => undefined);
    return run;
  }, []);

  useEffect(() => {
    const saver = createAutosaver<WbElement[]>({
      delay: 1500,
      onStatus: setStatus,
      save: (els) =>
        enqueue(async () => {
          const result = await saveScene(row.id, els, expectedRef.current);
          if ("updatedAt" in result) {
            expectedRef.current = result.updatedAt;
            if (latestRef.current === els) clearDraft(row.id);
          }
          return result;
        }),
    });
    saverRef.current = saver;

    if (usingDraft) {
      toast.info("Recuperei alterações deste quadro que não tinham sido salvas.");
      saver.schedule(latestRef.current);
    }

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      void saver.flush();
      if (statusRef.current !== "saved") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      void saver.flush().finally(() => saver.dispose());
      saverRef.current = null;
    };
  }, [row.id, usingDraft, enqueue, setStatus]);

  const handleChange = useCallback(
    (els: WbElement[]) => {
      latestRef.current = els;
      saveDraft(row.id, els);
      saverRef.current?.schedule(els);
    },
    [row.id],
  );

  const commitTitle = () => {
    const next = title.trim() || "Sem título";
    setTitle(next);
    if (next === savedTitleRef.current) return;
    void enqueue(async () => {
      const result = await saveTitle(row.id, next, expectedRef.current);
      if ("updatedAt" in result) {
        expectedRef.current = result.updatedAt;
        savedTitleRef.current = next;
        queryClient.invalidateQueries({ queryKey: ["whiteboards"] });
      } else {
        setStatus(result.reason === "conflict" ? "conflict" : "error");
        toast.error(result.reason === "denied" ? "Você não tem permissão para renomear este quadro." : "Não consegui renomear o quadro.");
      }
    });
  };

  const keepMine = async () => {
    const latest = await fetchUpdatedAt(row.id);
    if (!latest) {
      toast.error("Não consegui falar com o servidor. Tente de novo em instantes.");
      return;
    }
    expectedRef.current = latest;
    saverRef.current?.schedule(latestRef.current);
    await saverRef.current?.flush();
  };

  const discardMine = () => {
    clearDraft(row.id);
    window.location.reload();
  };

  const banner =
    status === "conflict" ? (
      <div role="alert" className="flex max-w-xl flex-col gap-2 rounded-lg border border-destructive/50 bg-card p-3 text-sm shadow-lg">
        <p className="font-medium">Este quadro foi alterado em outra aba ou por outra pessoa.</p>
        <p className="text-muted-foreground">Suas alterações ainda não foram salvas. O que você prefere?</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={keepMine}>
            Manter minha versão
          </Button>
          <Button size="sm" variant="outline" onClick={discardMine}>
            Descartar a minha e recarregar
          </Button>
        </div>
      </div>
    ) : null;

  return (
    <div className={FRAME}>
      <Whiteboard
        initialElements={initial}
        onChange={handleChange}
        exportName={title}
        banner={banner}
        header={
          <>
            <Button asChild variant="ghost" size="icon" className="h-8 w-8">
              <Link to="/quadro" aria-label="Voltar para os quadros">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  setTitle(savedTitleRef.current);
                  e.currentTarget.blur();
                }
              }}
              aria-label="Título do quadro"
              className="h-8 w-48 rounded-md border border-transparent bg-transparent px-2 text-sm font-medium outline-none hover:border-border focus:border-ring"
            />
            <SaveIndicator status={status} />
          </>
        }
      />
    </div>
  );
}
