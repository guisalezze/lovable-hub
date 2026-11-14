import type { Camera, ElementType, LaserTrail, Tool, WbElement } from "./types";
import { createElement } from "./scene";
import { History } from "./history";
import { panBy, screenToWorld } from "./camera";
import {
  elementsInRect,
  handleAtPoint,
  hitTest,
  resizeBounds,
  scalePoints,
  selectionFrame,
  type Bounds,
  type HandleId,
} from "./geometry";

/** Entrada de ponteiro: x,y em pixels de tela, relativos ao canvas. */
export interface PointerInput {
  x: number;
  y: number;
  shift: boolean;
  ctrl: boolean;
  button: number;
}

export interface EngineCallbacks {
  onChange(elements: WbElement[]): void;
  onToolChange(tool: Tool): void;
  onSelectionChange(ids: string[]): void;
  onRequestRender(): void;
}

interface Pt {
  x: number;
  y: number;
}

type Gesture =
  | { kind: "creating"; id: string; start: Pt; before: WbElement[] }
  | { kind: "drawing"; id: string; before: WbElement[] }
  | { kind: "moving"; start: Pt; before: WbElement[]; ids: Set<string>; moved: boolean }
  | { kind: "resizing"; handle: HandleId; start: Pt; before: WbElement[]; ids: Set<string>; origBounds: Bounds; changed: boolean }
  | { kind: "marquee"; start: Pt; base: Set<string> }
  | { kind: "panning"; last: Pt }
  | { kind: "erasing"; before: WbElement[]; removed: Set<string> };

const SHAPE_TOOLS: Tool[] = ["rectangle", "diamond", "ellipse", "line", "arrow"];
const HIT_TOLERANCE = 6; // px de tela
const MIN_SHAPE = 2; // px de tela: menor que isso é só um clique

const isLinear = (type: ElementType) => type === "line" || type === "arrow" || type === "freedraw";

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/** Leva um elemento da caixa `from` para a caixa `to` (usado no redimensionamento). */
function transformElement(el: WbElement, from: Bounds, to: Bounds): WbElement {
  if (isLinear(el.type)) {
    const abs: [number, number][] = (el.points ?? []).map(([px, py]) => [el.x + px, el.y + py]);
    if (abs.length === 0) return el;
    const scaled = scalePoints(abs, from, to);
    const [ox, oy] = scaled[0];
    const xs = scaled.map((p) => p[0]);
    const ys = scaled.map((p) => p[1]);
    return {
      ...el,
      x: ox,
      y: oy,
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      points: scaled.map(([px, py]) => [px - ox, py - oy]),
    };
  }
  const sx = from.width === 0 ? 1 : to.width / from.width;
  const sy = from.height === 0 ? 1 : to.height / from.height;
  return {
    ...el,
    x: to.x + (el.x - from.x) * sx,
    y: to.y + (el.y - from.y) * sy,
    width: el.width * sx,
    height: el.height * sy,
  };
}

export class WhiteboardEngine {
  tool: Tool = "select";
  camera: Camera = { x: 0, y: 0, zoom: 1 };
  elements: WbElement[] = [];
  selectedIds = new Set<string>();
  marquee: Bounds | null = null;
  trails: LaserTrail[] = [];
  /** Espaço segurado: qualquer arrasto vira mover a câmera. */
  spaceHeld = false;

  private history = new History([]);
  private gesture: Gesture | null = null;

  constructor(private cb: EngineCallbacks) {}

  // ---- estado -----------------------------------------------------------

  load(elements: WbElement[]): void {
    this.gesture = null;
    this.marquee = null;
    this.elements = elements;
    this.history.reset(elements);
    this.setSelection(new Set());
    this.invalidate();
  }

  setTool(tool: Tool): void {
    if (this.gesture) this.pointerCancel();
    this.tool = tool;
    if (tool !== "select") this.setSelection(new Set());
    this.cb.onToolChange(tool);
    this.invalidate();
  }

  getSelected(): WbElement[] {
    return this.elements.filter((el) => this.selectedIds.has(el.id));
  }

  selectAll(): void {
    this.setSelection(new Set(this.elements.map((el) => el.id)));
    this.invalidate();
  }

  clearSelection(): void {
    this.setSelection(new Set());
    this.invalidate();
  }

  deleteSelection(): void {
    const ids = new Set(this.getSelected().filter((el) => !el.locked).map((el) => el.id));
    if (ids.size === 0) return;
    this.elements = this.elements.filter((el) => !ids.has(el.id));
    this.setSelection(new Set([...this.selectedIds].filter((id) => !ids.has(id))));
    this.commit();
  }

  undo(): void {
    const prev = this.history.undo();
    if (prev) this.applyHistory(prev);
  }

  redo(): void {
    const next = this.history.redo();
    if (next) this.applyHistory(next);
  }

  // ---- ponteiro ---------------------------------------------------------

  pointerDown(p: PointerInput): void {
    if (this.gesture) this.pointerCancel();
    if (p.button === 1 || this.tool === "hand" || this.spaceHeld) {
      this.gesture = { kind: "panning", last: { x: p.x, y: p.y } };
      return;
    }
    if (p.button !== 0) return;
    const w = this.toWorld(p);

    if (this.tool === "select") return this.downSelect(p, w);
    if (SHAPE_TOOLS.includes(this.tool)) return this.downCreate(w);
    if (this.tool === "pencil") return this.downPencil(w);
    if (this.tool === "eraser") return this.downErase(w);
    // laser: tratado na Task 13
  }

  pointerMove(p: PointerInput): void {
    const g = this.gesture;
    if (!g) return;
    const w = this.toWorld(p);

    switch (g.kind) {
      case "creating":
        this.moveCreate(g, w, p.shift);
        break;
      case "drawing":
        this.moveDraw(g, w);
        break;
      case "moving": {
        const dx = w.x - g.start.x;
        const dy = w.y - g.start.y;
        g.moved = g.moved || dx !== 0 || dy !== 0;
        this.elements = g.before.map((el) => (g.ids.has(el.id) ? { ...el, x: el.x + dx, y: el.y + dy } : el));
        break;
      }
      case "resizing": {
        const next = resizeBounds(g.origBounds, g.handle, w.x - g.start.x, w.y - g.start.y, p.shift);
        g.changed = true;
        this.elements = g.before.map((el) => (g.ids.has(el.id) ? transformElement(el, g.origBounds, next) : el));
        break;
      }
      case "marquee": {
        const rect: Bounds = {
          x: Math.min(g.start.x, w.x),
          y: Math.min(g.start.y, w.y),
          width: Math.abs(w.x - g.start.x),
          height: Math.abs(w.y - g.start.y),
        };
        this.marquee = rect;
        this.setSelection(new Set([...g.base, ...elementsInRect(this.elements, rect)]));
        break;
      }
      case "panning":
        this.camera = panBy(this.camera, p.x - g.last.x, p.y - g.last.y);
        g.last = { x: p.x, y: p.y };
        break;
      case "erasing":
        this.eraseAt(g, w);
        break;
    }
    this.invalidate();
  }

  pointerUp(_p: PointerInput): void {
    const g = this.gesture;
    if (!g) return;
    this.gesture = null;

    switch (g.kind) {
      case "creating": {
        const el = this.elements.find((e) => e.id === g.id);
        const min = MIN_SHAPE / this.camera.zoom;
        const tooSmall = !el || (el.width < min && el.height < min);
        if (tooSmall) {
          this.elements = g.before;
        } else {
          this.tool = "select";
          this.cb.onToolChange("select");
          this.setSelection(new Set([g.id]));
          this.commit();
        }
        break;
      }
      case "drawing":
        this.commit();
        break;
      case "moving":
        if (g.moved && this.elements.some((el, i) => el.x !== g.before[i].x || el.y !== g.before[i].y)) this.commit();
        break;
      case "resizing":
        if (g.changed) this.commit();
        break;
      case "marquee":
        this.marquee = null;
        break;
      case "erasing":
        if (g.removed.size > 0) {
          this.setSelection(new Set([...this.selectedIds].filter((id) => !g.removed.has(id))));
          this.commit();
        }
        break;
      case "panning":
        break;
    }
    this.invalidate();
  }

  /** Gesto interrompido (pointercancel, ponteiro saiu da janela): volta ao estado de antes. */
  pointerCancel(): void {
    const g = this.gesture;
    if (!g) return;
    this.gesture = null;
    if (g.kind === "marquee") {
      this.marquee = null;
      this.setSelection(g.base);
    } else if (g.kind !== "panning") {
      this.elements = g.before;
    }
    this.invalidate();
  }

  // ---- gestos: início ---------------------------------------------------

  private downSelect(p: PointerInput, w: Pt): void {
    const selected = this.getSelected();
    const frame = selectionFrame(selected, this.camera.zoom);
    if (frame) {
      const handle = handleAtPoint(frame, w, this.camera.zoom);
      if (handle && handle !== "rotate") {
        const ids = new Set(selected.filter((el) => !el.locked).map((el) => el.id));
        this.gesture = { kind: "resizing", handle, start: w, before: this.elements, ids, origBounds: frame.bounds, changed: false };
        return;
      }
    }

    const hit = this.hitElement(w);
    if (hit) {
      if (p.shift && this.selectedIds.has(hit.id)) {
        const next = new Set(this.selectedIds);
        next.delete(hit.id);
        this.setSelection(next);
        this.invalidate();
        return;
      }
      if (p.shift) this.setSelection(new Set([...this.selectedIds, hit.id]));
      else if (!this.selectedIds.has(hit.id)) this.setSelection(new Set([hit.id]));
      const ids = new Set(this.getSelected().filter((el) => !el.locked).map((el) => el.id));
      this.gesture = { kind: "moving", start: w, before: this.elements, ids, moved: false };
      this.invalidate();
      return;
    }

    const base = p.shift ? new Set(this.selectedIds) : new Set<string>();
    if (!p.shift) this.setSelection(new Set());
    this.gesture = { kind: "marquee", start: w, base };
    this.invalidate();
  }

  private downCreate(w: Pt): void {
    const type = this.tool as ElementType;
    const el = createElement(type, w.x, w.y, type === "line" || type === "arrow" ? { points: [[0, 0], [0, 0]] } : {});
    this.gesture = { kind: "creating", id: el.id, start: w, before: this.elements };
    this.elements = [...this.elements, el];
    this.invalidate();
  }

  private downPencil(w: Pt): void {
    const el = createElement("freedraw", w.x, w.y, { points: [[0, 0]] });
    this.gesture = { kind: "drawing", id: el.id, before: this.elements };
    this.elements = [...this.elements, el];
    this.invalidate();
  }

  private downErase(w: Pt): void {
    const g: Gesture = { kind: "erasing", before: this.elements, removed: new Set() };
    this.gesture = g;
    this.eraseAt(g, w);
    this.invalidate();
  }

  // ---- gestos: andamento ------------------------------------------------

  private moveCreate(g: Extract<Gesture, { kind: "creating" }>, w: Pt, shift: boolean): void {
    let dx = w.x - g.start.x;
    let dy = w.y - g.start.y;
    this.elements = this.elements.map((el) => {
      if (el.id !== g.id) return el;
      if (isLinear(el.type)) {
        return { ...el, width: Math.abs(dx), height: Math.abs(dy), points: [[0, 0], [dx, dy]] };
      }
      if (shift) {
        const side = Math.max(Math.abs(dx), Math.abs(dy));
        dx = Math.sign(dx || 1) * side;
        dy = Math.sign(dy || 1) * side;
      }
      return {
        ...el,
        x: Math.min(g.start.x, g.start.x + dx),
        y: Math.min(g.start.y, g.start.y + dy),
        width: Math.abs(dx),
        height: Math.abs(dy),
      };
    });
  }

  private moveDraw(g: Extract<Gesture, { kind: "drawing" }>, w: Pt): void {
    this.elements = this.elements.map((el) => {
      if (el.id !== g.id) return el;
      const pts = el.points ?? [];
      const next: [number, number] = [w.x - el.x, w.y - el.y];
      const last = pts[pts.length - 1];
      if (last && last[0] === next[0] && last[1] === next[1]) return el;
      return { ...el, points: [...pts, next] };
    });
  }

  private eraseAt(g: Extract<Gesture, { kind: "erasing" }>, w: Pt): void {
    const tol = HIT_TOLERANCE / this.camera.zoom;
    const hits = this.elements.filter((el) => !el.locked && hitTest(el, w, tol));
    if (hits.length === 0) return;
    for (const el of hits) g.removed.add(el.id);
    this.elements = this.elements.filter((el) => !g.removed.has(el.id));
  }

  // ---- utilitários ------------------------------------------------------

  private toWorld(p: Pt): Pt {
    return screenToWorld(this.camera, p);
  }

  private hitElement(w: Pt): WbElement | null {
    const tol = HIT_TOLERANCE / this.camera.zoom;
    for (let i = this.elements.length - 1; i >= 0; i--) {
      if (hitTest(this.elements[i], w, tol)) return this.elements[i];
    }
    return null;
  }

  private setSelection(next: Set<string>): void {
    if (sameSet(this.selectedIds, next)) return;
    this.selectedIds = next;
    this.cb.onSelectionChange([...next]);
  }

  /** Fecha um gesto que mudou a cena: um passo de histórico e um aviso. */
  private commit(): void {
    this.history.push(this.elements);
    this.cb.onChange(this.elements);
  }

  private applyHistory(elements: WbElement[]): void {
    this.elements = elements;
    const alive = new Set(elements.map((el) => el.id));
    this.setSelection(new Set([...this.selectedIds].filter((id) => alive.has(id))));
    this.cb.onChange(this.elements);
    this.invalidate();
  }

  private invalidate(): void {
    this.cb.onRequestRender();
  }
}
