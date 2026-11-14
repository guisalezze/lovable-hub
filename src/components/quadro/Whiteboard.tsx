import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { WhiteboardEngine } from "@/lib/whiteboard/engine";
import { bindCanvas, type CanvasBinding } from "@/lib/whiteboard/bindCanvas";
import { readThemeColors } from "@/lib/whiteboard/theme";
import { fitCamera, zoomAt } from "@/lib/whiteboard/camera";
import { getSelectionBounds } from "@/lib/whiteboard/geometry";
import type { Tool, WbElement } from "@/lib/whiteboard/types";
import { BottomBar, ToolPalette } from "./Toolbar";

export interface WhiteboardProps {
  /** Elementos com que o quadro abre. Lido só uma vez, na montagem. */
  initialElements: WbElement[];
  /** Chamado uma vez por gesto concluído (e a cada desfazer/refazer). */
  onChange: (elements: WbElement[]) => void;
  /** Ilha no canto superior esquerdo (voltar, título, status de salvamento). */
  header?: ReactNode;
  /** Faixa no topo, no centro (avisos como conflito de edição). */
  banner?: ReactNode;
}

/**
 * Quadro: canvas + barras. Só recebe e entrega elementos; não sabe nada de banco de dados,
 * então funciona igual dentro do CRM e numa página de teste.
 */
export function Whiteboard({ initialElements, onChange, header, banner }: WhiteboardProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<WhiteboardEngine | null>(null);
  const bindingRef = useRef<CanvasBinding | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initialRef = useRef(initialElements);

  const [tool, setTool] = useState<Tool>("select");
  const [zoom, setZoom] = useState(1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;

    let theme = readThemeColors();
    let fitted = false;
    let binding: CanvasBinding | null = null;

    const engine = new WhiteboardEngine({
      onChange: (els) => onChangeRef.current(els),
      onToolChange: setTool,
      onSelectionChange: () => {},
      onRequestRender: () => binding?.render(),
    });
    engine.load(initialRef.current);

    binding = bindCanvas(canvas, engine, {
      root,
      getTheme: () => theme,
      getShowGrid: () => true,
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
    return () => {
      themeObserver.disconnect();
      binding?.destroy();
      engineRef.current = null;
      bindingRef.current = null;
    };
  }, []);

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

  return (
    <div ref={rootRef} data-whiteboard-root tabIndex={0} className="relative h-full w-full select-none overflow-hidden bg-background outline-none">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {header ? <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-border bg-card/95 p-1.5 shadow-sm backdrop-blur">{header}</div> : null}

      <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
        <ToolPalette
          tool={tool}
          onTool={(t) => {
            engineRef.current?.setTool(t);
            focusBoard();
          }}
        />
      </div>

      {banner ? <div className="absolute left-1/2 top-16 z-20 -translate-x-1/2">{banner}</div> : null}

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
        />
      </div>
    </div>
  );
}
