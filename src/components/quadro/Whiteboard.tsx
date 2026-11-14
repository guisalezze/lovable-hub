import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { WhiteboardEngine } from "@/lib/whiteboard/engine";
import { bindCanvas, type CanvasBinding } from "@/lib/whiteboard/bindCanvas";
import { readThemeColors, type ThemeColors } from "@/lib/whiteboard/theme";
import { fitCamera, zoomAt } from "@/lib/whiteboard/camera";
import { getSelectionBounds } from "@/lib/whiteboard/geometry";
import type { Camera, StylePatch, Tool, WbElement } from "@/lib/whiteboard/types";
import { BottomBar, ToolPalette } from "./Toolbar";
import { StylePanel } from "./StylePanel";
import { RichTextEditor } from "./RichTextEditor";
import { TEXT_TYPES } from "@/lib/whiteboard/textblock";
import { usePresentationMode } from "./usePresentationMode";
import { BoardContextMenu, type MenuAction } from "./BoardContextMenu";
import { clipboard } from "@/lib/whiteboard/ops";
import { toast } from "sonner";
import { ExportMenu, type ExportKind } from "./ExportMenu";
import { copyPngToClipboard, downloadBlob, exportFileName, exportToPng, exportToSvg } from "@/lib/whiteboard/export";

const DRAWING_TOOLS: Tool[] = ["rectangle", "diamond", "ellipse", "arrow", "line", "pencil", "text", "note"];

export interface WhiteboardProps {
  /** Elementos com que o quadro abre. Lido só uma vez, na montagem. */
  initialElements: WbElement[];
  /** Chamado uma vez por gesto concluído (e a cada desfazer/refazer). */
  onChange: (elements: WbElement[]) => void;
  /** Ilha no canto superior esquerdo (voltar, título, status de salvamento). */
  header?: ReactNode;
  /** Faixa no topo, no centro (avisos como conflito de edição). */
  banner?: ReactNode;
  /** Nome base dos arquivos exportados (o título do quadro). */
  exportName?: string;
}

/**
 * Quadro: canvas + barras. Só recebe e entrega elementos; não sabe nada de banco de dados,
 * então funciona igual dentro do CRM e numa página de teste.
 */
export function Whiteboard({ initialElements, onChange, header, banner, exportName = "quadro" }: WhiteboardProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<WhiteboardEngine | null>(null);
  const bindingRef = useRef<CanvasBinding | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initialRef = useRef(initialElements);

  const presentation = usePresentationMode(rootRef);
  const presentationRef = useRef(false);
  presentationRef.current = presentation.active;
  const togglePresentationRef = useRef<() => void>(() => {});
  togglePresentationRef.current = () => void (presentation.active ? presentation.exit() : presentation.enter());
  const [hint, setHint] = useState(false);
  const [gridOn, setGridOn] = useState(() => {
    try {
      return localStorage.getItem("quadro:grid") !== "off";
    } catch {
      return true;
    }
  });
  const gridRef = useRef(gridOn);
  gridRef.current = gridOn;

  const [tool, setTool] = useState<Tool>("select");
  const [zoom, setZoom] = useState(1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [style, setStyle] = useState<StylePatch>({});
  const [selectedCount, setSelectedCount] = useState(0);
  const [textMode, setTextMode] = useState({ only: false, has: false });
  const [editing, setEditing] = useState<{ el: WbElement; camera: Camera; theme: ThemeColors } | null>(null);
  const [menuInfo, setMenuInfo] = useState({ count: 0, hasGroup: false, allLocked: false, canPaste: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;

    let theme = readThemeColors();
    let fitted = false;
    let binding: CanvasBinding | null = null;

    const syncStyle = () => {
      setStyle(engine.getActiveStyle());
      const selected = engine.getSelected();
      const textTool = engine.tool === "text" || engine.tool === "note";
      setTextMode({
        only: selected.length > 0 ? selected.every((e) => e.type === "text") : engine.tool === "text",
        has: textTool || selected.some((e) => TEXT_TYPES.includes(e.type)),
      });
    };
    const engine = new WhiteboardEngine({
      onChange: (els) => {
        onChangeRef.current(els);
        syncStyle();
      },
      onToolChange: (t) => {
        setTool(t);
        syncStyle();
      },
      onSelectionChange: (ids) => {
        setSelectedCount(ids.length);
        syncStyle();
      },
      onRequestRender: () => binding?.render(),
      onEditText: (id) => {
        const el = id ? engine.elements.find((e) => e.id === id) : null;
        setEditing(el ? { el, camera: { ...engine.camera }, theme } : null); // o campo de texto fica onde o texto vai aparecer
      },
    });
    engine.load(initialRef.current);

    binding = bindCanvas(canvas, engine, {
      root,
      getTheme: () => theme,
      getShowGrid: () => gridRef.current && !presentationRef.current, // sem grade na apresentação: vídeo mais limpo
      onPresentation: () => togglePresentationRef.current(),
      getShowSelection: () => !presentationRef.current,
      onFrame: () => {
        if (!fitted) {
          // primeiro quadro desenhado: já sabemos o tamanho da tela, então enquadra o conteúdo
          fitted = true;
          const r = canvas.getBoundingClientRect();
          engine.camera = fitCamera(getSelectionBounds(engine.elements), { width: r.width, height: r.height });
          binding?.render();
        }
        setZoom(engine.camera.zoom);
        setCanUndo(engine.canUndo);
        setCanRedo(engine.canRedo);
      },
    });

    // O CRM troca de design (src/lib/designs.ts) com data-design no <html> e a classe "dark":
    // relê as cores do tema e redesenha.
    const themeObserver = new MutationObserver(() => {
      theme = readThemeColors();
      binding?.render();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-design"] });

    engineRef.current = engine;
    bindingRef.current = binding;
    root.focus({ preventScroll: true }); // atalhos do quadro valem desde o primeiro instante, sem precisar clicar antes
    return () => {
      themeObserver.disconnect();
      binding?.destroy();
      engineRef.current = null;
      bindingRef.current = null;
    };
  }, []);

  // Entrar/sair da apresentação: redesenha (a grade some) e mostra a dica por alguns segundos
  useEffect(() => {
    bindingRef.current?.render();
    if (!presentation.active) {
      setHint(false);
      return;
    }
    setHint(true);
    const timer = setTimeout(() => setHint(false), 3500);
    return () => clearTimeout(timer);
  }, [presentation.active]);

  // a grade liga/desliga e a escolha fica guardada neste navegador
  useEffect(() => {
    bindingRef.current?.render();
    try {
      localStorage.setItem("quadro:grid", gridOn ? "on" : "off");
    } catch {
      /* sem armazenamento: vale só nesta sessão */
    }
  }, [gridOn]);

  const viewport = useCallback(() => {
    const r = canvasRef.current?.getBoundingClientRect();
    return { width: r?.width ?? 0, height: r?.height ?? 0 };
  }, []);

  const zoomBy = useCallback(
    (factor: number) => {
      const engine = engineRef.current;
      if (!engine) return;
      const v = viewport();
      engine.camera = zoomAt(engine.camera, { x: v.width / 2, y: v.height / 2 }, factor);
      bindingRef.current?.render();
    },
    [viewport],
  );

  const focusBoard = () => rootRef.current?.focus({ preventScroll: true });

  const applyStyle = (patch: StylePatch) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.applyStyle(patch);
    setStyle(engine.getActiveStyle());
    focusBoard();
  };

  const refreshMenuInfo = (e: React.MouseEvent) => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    if (!engine || !canvas) return;
    const r = canvas.getBoundingClientRect();
    engine.selectAtPoint({ x: e.clientX - r.left, y: e.clientY - r.top }); // botão direito seleciona o que está sob o cursor
    setMenuInfo({ ...engine.getSelectionInfo(), canPaste: clipboard.items.length > 0 });
  };

  const runMenuAction = (action: MenuAction) => {
    const engine = engineRef.current;
    if (!engine) return;
    switch (action) {
      case "copy": engine.copy(); break;
      case "paste": engine.paste(); break;
      case "duplicate": engine.duplicate(); break;
      case "group": engine.group(); break;
      case "ungroup": engine.ungroup(); break;
      case "front": engine.bringToFront(); break;
      case "forward": engine.bringForward(); break;
      case "backward": engine.sendBackward(); break;
      case "back": engine.sendToBack(); break;
      case "lock": engine.toggleLock(); break;
      case "delete": engine.deleteSelection(); break;
      case "align-left": engine.align("left"); break;
      case "align-center": engine.align("center"); break;
      case "align-right": engine.align("right"); break;
      case "align-top": engine.align("top"); break;
      case "align-middle": engine.align("middle"); break;
      case "align-bottom": engine.align("bottom"); break;
    }
    focusBoard();
  };

  // Exporta a seleção se houver; senão o quadro todo. O fundo do tema vai junto: o traço "auto" é claro no tema escuro.
  const runExport = async (kind: ExportKind) => {
    const engine = engineRef.current;
    if (!engine) return;
    const selected = engine.getSelected();
    const elements = selected.length > 0 ? selected : engine.elements;
    if (elements.length === 0) {
      toast.error("Nada para exportar: o quadro está vazio.");
      return;
    }
    const opts = { theme: readThemeColors(), background: true };
    try {
      if (kind === "svg") {
        downloadBlob(new Blob([exportToSvg(elements, opts)], { type: "image/svg+xml" }), exportFileName(exportName, "svg"));
        return;
      }
      const png = await exportToPng(elements, opts);
      if (kind === "png") {
        downloadBlob(png, exportFileName(exportName, "png"));
      } else if (await copyPngToClipboard(png)) {
        toast.success("Imagem copiada.");
      } else {
        toast.error("O navegador não deixou copiar. Use Baixar PNG.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui exportar.");
    }
  };

  const showStylePanel = !presentation.active && (selectedCount > 0 || DRAWING_TOOLS.includes(tool));

  return (
    <div
      ref={rootRef}
      data-whiteboard-root
      tabIndex={0}
      onKeyDown={(e) => {
        // sem tela cheia (negada pelo navegador) o Esc chega aqui; com tela cheia o navegador cuida dele
        if (e.key === "Escape" && presentation.active) void presentation.exit();
      }}
      className="relative h-full w-full select-none overflow-hidden bg-background outline-none">
      <BoardContextMenu {...menuInfo} onAction={runMenuAction} onContextMenu={refreshMenuInfo}>
        <div className="absolute inset-0">
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />
        </div>
      </BoardContextMenu>

      {header && !presentation.active ? <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-border bg-card/95 p-1.5 shadow-sm backdrop-blur">{header}</div> : null}

      {!presentation.active ? (
        <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
          <ToolPalette
            tool={tool}
            onTool={(t) => {
              engineRef.current?.setTool(t);
              focusBoard();
            }}
          />
        </div>
      ) : null}

      {editing ? (
        <RichTextEditor
          key={editing.el.id}
          element={editing.el}
          camera={editing.camera}
          theme={editing.theme}
          onCommit={(runs) => {
            engineRef.current?.commitRuns(editing.el.id, runs);
            focusBoard();
          }}
          onStyle={(patch) => {
            const engine = engineRef.current;
            if (!engine) return;
            engine.updateEditing(patch);
            const el = engine.getEditingElement();
            if (el) setEditing((cur) => (cur ? { ...cur, el } : cur));
          }}
        />
      ) : null}

      {!presentation.active ? (
        <div className="absolute right-3 top-3 z-10">
          <ExportMenu hasSelection={selectedCount > 0} onExport={runExport} />
        </div>
      ) : null}

      {showStylePanel ? (
        <div className="absolute left-3 top-20 z-10">
          <StylePanel style={style} onChange={applyStyle} textOnly={textMode.only} showFontSize={textMode.has} />
        </div>
      ) : null}

      {banner ? <div className="absolute left-1/2 top-16 z-20 -translate-x-1/2">{banner}</div> : null}

      {!presentation.active ? (
        <div className="absolute bottom-3 left-3 z-10">
          <BottomBar
            zoom={zoom}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={() => {
              engineRef.current?.undo();
              focusBoard();
            }}
            onRedo={() => {
              engineRef.current?.redo();
              focusBoard();
            }}
            onZoomIn={() => zoomBy(1.25)}
            onZoomOut={() => zoomBy(1 / 1.25)}
            onResetZoom={() => zoomBy(1 / (engineRef.current?.camera.zoom ?? 1))}
            onFit={() => {
              const engine = engineRef.current;
              if (!engine) return;
              engine.camera = fitCamera(getSelectionBounds(engine.elements), viewport());
              bindingRef.current?.render();
            }}
            gridOn={gridOn}
            onToggleGrid={() => {
              setGridOn((v) => !v);
              focusBoard();
            }}
            onPresent={() => {
              void presentation.enter();
              focusBoard();
            }}
          />
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => void presentation.exit()}
            className="absolute right-3 top-3 z-20 rounded-md border border-border bg-card/90 px-3 py-1.5 text-xs opacity-0 shadow-sm transition-opacity hover:opacity-100 focus:opacity-100"
          >
            Sair da apresentação (Esc)
          </button>
          {hint ? (
            <div role="status" className="pointer-events-none absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-full border border-border bg-card/90 px-4 py-2 text-xs shadow-sm">
              Modo apresentação · Esc para sair · K laser · P lápis · V seleção
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
