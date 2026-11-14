import { panBy, zoomAt } from "./camera";
import { drawScene } from "./render";
import { isEditableTarget, resolveShortcut } from "./shortcuts";
import type { ThemeColors } from "./theme";
import type { PointerInput, WhiteboardEngine } from "./engine";

export interface BindOptions {
  getTheme(): ThemeColors;
  getShowGrid(): boolean;
  /** Elemento que recebe o teclado (precisa de tabIndex). Padrão: o ancestral [data-whiteboard-root]. */
  root?: HTMLElement;
  /** Chamado depois de cada quadro desenhado (para a interface acompanhar zoom e histórico). */
  onFrame?(): void;
  /** Tecla F: liga/desliga o modo apresentação (quem decide o que isso faz é a interface). */
  onPresentation?(): void;
  /** false = esconde a moldura de seleção (modo apresentação). Padrão: true. */
  getShowSelection?(): boolean;
}

export interface CanvasBinding {
  /** Pede um redesenho (vários pedidos no mesmo quadro viram um só). */
  render(): void;
  destroy(): void;
}

/**
 * Liga o canvas ao motor: ponteiro, roda do mouse, teclado, tamanho e redesenho.
 * O teclado é escutado só na raiz do editor (com foco), nunca no document.
 */
export function bindCanvas(canvas: HTMLCanvasElement, engine: WhiteboardEngine, opts: BindOptions): CanvasBinding {
  const root = opts.root ?? (canvas.closest("[data-whiteboard-root]") as HTMLElement | null) ?? canvas;
  const ctx = canvas.getContext("2d");
  let size = { w: 0, h: 0, dpr: 1 };
  let raf = 0;

  const draw = () => {
    raf = 0;
    if (!ctx || size.w === 0) return;
    canvas.style.cursor =
      engine.spaceHeld || engine.tool === "hand" ? "grab" : engine.tool === "select" ? "default" : "crosshair";
    const now = performance.now();
    const animating = engine.tickLaser(now); // o laser some sozinho: enquanto houver rastro, continua animando
    drawScene(ctx, {
      elements: engine.elements,
      camera: engine.camera,
      theme: opts.getTheme(),
      selectedIds: engine.selectedIds,
      showGrid: opts.getShowGrid(),
      width: size.w,
      height: size.h,
      dpr: size.dpr,
      marquee: engine.marquee,
      trails: engine.trails,
      now,
      showSelection: opts.getShowSelection ? opts.getShowSelection() : true,
      hiddenId: engine.editingId,
      guides: engine.guides,
      highlightId: engine.bindHighlightId,
      ruler: engine.rulerOn ? engine.cursor : null,
    });
    opts.onFrame?.();
    if (animating) render();
  };
  const render = () => {
    if (!raf) raf = requestAnimationFrame(draw);
  };

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    size = { w: r.width, h: r.height, dpr };
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    render();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  const toInput = (e: PointerEvent): PointerInput => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, button: e.button };
  };

  const onPointerDown = (e: PointerEvent) => {
    root.focus({ preventScroll: true });
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ponteiro sintético: segue sem captura */
    }
    engine.pointerDown(toInput(e));
  };
  const onPointerMove = (e: PointerEvent) => engine.pointerMove(toInput(e));
  const onPointerUp = (e: PointerEvent) => {
    engine.pointerUp(toInput(e));
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* já liberado */
    }
  };
  const onPointerCancel = () => engine.pointerCancel();
  const onPointerLeave = () => engine.pointerLeave();
  const onDoubleClick = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    engine.doubleClick({ x: e.clientX - r.left, y: e.clientY - r.top });
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      engine.camera = zoomAt(engine.camera, { x: e.clientX - r.left, y: e.clientY - r.top }, Math.exp(-e.deltaY * 0.0015));
    } else {
      engine.camera = panBy(engine.camera, -e.deltaX, -e.deltaY);
    }
    render();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === "Space" && !isEditableTarget(e.target)) {
      e.preventDefault();
      engine.spaceHeld = true;
      render();
      return;
    }
    const action = resolveShortcut(e);
    if (!action) return;
    e.preventDefault();
    switch (action.kind) {
      case "tool":
        engine.setTool(action.tool);
        break;
      case "undo":
        engine.undo();
        break;
      case "redo":
        engine.redo();
        break;
      case "delete":
        engine.deleteSelection();
        break;
      case "selectAll":
        engine.selectAll();
        break;
      case "escape":
        engine.pointerCancel();
        engine.setTool("select");
        engine.clearSelection();
        break;
      case "duplicate":
        engine.duplicate();
        break;
      case "copy":
        engine.copy();
        break;
      case "paste":
        engine.paste();
        break;
      case "cut":
        engine.cut();
        break;
      case "group":
        engine.group();
        break;
      case "ungroup":
        engine.ungroup();
        break;
      case "lock":
        engine.toggleLock();
        break;
      case "forward":
        engine.bringForward();
        break;
      case "backward":
        engine.sendBackward();
        break;
      case "front":
        engine.bringToFront();
        break;
      case "back":
        engine.sendToBack();
        break;
      case "presentation":
        opts.onPresentation?.();
        break;
      case "copyStyle":
        engine.copyStyle();
        break;
      case "pasteStyle":
        engine.pasteStyle();
        break;
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === "Space") {
      engine.spaceHeld = false;
      render();
    }
  };
  const onBlur = () => {
    engine.spaceHeld = false;
    render();
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("dblclick", onDoubleClick);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  root.addEventListener("keydown", onKeyDown);
  root.addEventListener("keyup", onKeyUp);
  root.addEventListener("blur", onBlur);

  return {
    render,
    destroy() {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("dblclick", onDoubleClick);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("wheel", onWheel);
      root.removeEventListener("keydown", onKeyDown);
      root.removeEventListener("keyup", onKeyUp);
      root.removeEventListener("blur", onBlur);
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    },
  };
}
