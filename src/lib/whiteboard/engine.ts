import type { Camera, ElementType, LaserTrail, StylePatch, Tool, WbElement } from "./types";
import { DEFAULT_STYLE } from "./palette";
import { addLaserPoint, endLaserTrail, pruneLaser } from "./laser";
import { measureText } from "./text";
import {
  alignElements,
  bringForward,
  bringToFront,
  clipboard,
  cloneElements,
  duplicateElements,
  expandToGroups,
  groupElements,
  sendBackward,
  sendToBack,
  toggleLock,
  ungroupElements,
  type AlignMode,
} from "./ops";
import { createElement } from "./scene";
import { History } from "./history";
import { panBy, screenToWorld } from "./camera";
import {
  bendFromHandle,
  bendHandlePoint,
  elementsInRect,
  getBounds,
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
  /** Abre (id) ou fecha (null) o campo de texto sobre o quadro. */
  onEditText?(id: string | null): void;
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
  | { kind: "erasing"; before: WbElement[]; removed: Set<string> }
  | { kind: "laser" }
  | { kind: "bending"; id: string; before: WbElement[]; changed: boolean }
  | { kind: "rotating"; id: string; center: Pt; startAngle: number; origAngle: number; before: WbElement[]; changed: boolean };

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
    let bend: [number, number] | undefined;
    if (el.bend) {
      const [bx, by] = scalePoints([[el.x + el.bend[0], el.y + el.bend[1]]], from, to)[0];
      bend = [bx - ox, by - oy];
    }
    const xs = scaled.map((p) => p[0]);
    const ys = scaled.map((p) => p[1]);
    return {
      ...el,
      x: ox,
      y: oy,
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      points: scaled.map(([px, py]) => [px - ox, py - oy]),
      ...(bend ? { bend } : {}),
    };
  }
  const sx = from.width === 0 ? 1 : to.width / from.width;
  const sy = from.height === 0 ? 1 : to.height / from.height;
  if (el.type === "text") {
    // redimensionar texto escala a fonte (e a caixa é remedida), nunca abaixo de 8
    const fontSize = Math.max(8, Math.round((el.fontSize ?? DEFAULT_STYLE.fontSize) * Math.max(sx, sy)));
    return { ...el, x: to.x + (el.x - from.x) * sx, y: to.y + (el.y - from.y) * sy, fontSize, ...measureText(el.text ?? "", fontSize) };
  }
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
  /** Estilo das próximas formas (o que o painel mostra quando nada está selecionado). */
  defaultStyle: StylePatch = {};
  /** Relógio do laser (ms). Os testes trocam por um relógio falso. */
  clock: () => number = () => performance.now();
  /** Id do texto que está sendo escrito agora (o campo de texto da interface cuida dele). */
  editingId: string | null = null;
  private newTextId: string | null = null;
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

  /** Aplica aparência à seleção (um passo de histórico) e vira o padrão das próximas formas. */
  applyStyle(patch: StylePatch): void {
    this.defaultStyle = { ...this.defaultStyle, ...patch };
    const targets = new Set(this.getSelected().filter((el) => !el.locked).map((el) => el.id));
    if (targets.size === 0) {
      this.invalidate();
      return;
    }
    const keys = (Object.keys(patch) as (keyof StylePatch)[]).filter((k) => patch[k] !== undefined);
    let changed = false;
    this.elements = this.elements.map((el) => {
      if (!targets.has(el.id)) return el;
      // o tamanho da fonte só vale para texto
      const applicable = keys.filter((k) => k !== "fontSize" || el.type === "text");
      if (!applicable.some((k) => el[k] !== patch[k])) return el;
      changed = true;
      const next: WbElement = { ...el };
      for (const k of applicable) (next as unknown as Record<string, unknown>)[k] = patch[k];
      if (el.type === "text" && applicable.includes("fontSize")) {
        Object.assign(next, measureText(next.text ?? "", next.fontSize ?? DEFAULT_STYLE.fontSize));
      }
      return next;
    });
    if (changed) this.commit();
    else this.invalidate();
  }

  /** Valor comum da seleção em cada propriedade (undefined = valores misturados); null sem seleção. */
  getStyleOfSelection(): StylePatch | null {
    const selected = this.getSelected();
    if (selected.length === 0) return null;
    const common = <K extends keyof StylePatch>(key: K): StylePatch[K] =>
      selected.every((el) => el[key] === selected[0][key]) ? selected[0][key] : undefined;
    return {
      strokeColor: common("strokeColor"),
      backgroundColor: common("backgroundColor"),
      strokeWidth: common("strokeWidth"),
      roundness: common("roundness"),
      fontSize: (() => {
        const texts = selected.filter((el) => el.type === "text");
        return texts.length > 0 && texts.every((t) => t.fontSize === texts[0].fontSize) ? texts[0].fontSize : undefined;
      })(),
    };
  }

  /** O que o painel de estilo deve mostrar agora. */
  getActiveStyle(): StylePatch {
    return this.getStyleOfSelection() ?? { ...DEFAULT_STYLE, ...this.defaultStyle };
  }

  /** Apaga do rastro o que já venceu. Devolve true enquanto ainda há o que animar. */
  tickLaser(now: number): boolean {
    this.trails = pruneLaser(this.trails, now);
    return this.trails.length > 0;
  }

  // ---- texto -----------------------------------------------------------

  /** Começa um texto novo em w (coordenadas do mundo). Só entra no histórico quando for confirmado com conteúdo. */
  beginText(w: Pt): void {
    const fontSize = this.defaultStyle.fontSize ?? DEFAULT_STYLE.fontSize;
    const el = createElement("text", w.x, w.y, { ...this.defaultStyle, text: "", fontSize, ...measureText("", fontSize) });
    this.elements = [...this.elements, el];
    this.newTextId = el.id;
    this.editingId = el.id;
    this.setSelection(new Set());
    this.cb.onEditText?.(el.id);
    this.invalidate();
  }

  /** Abre a edição de um texto que já existe. */
  editText(id: string): void {
    const el = this.elements.find((e) => e.id === id && e.type === "text");
    if (!el) return;
    this.newTextId = null;
    this.editingId = id;
    this.setSelection(new Set([id]));
    this.cb.onEditText?.(id);
    this.invalidate();
  }

  /** Duplo clique: edita o texto sob o cursor, ou cria um texto novo no vazio. */
  doubleClick(screen: Pt): void {
    if (this.editingId) return;
    const w = this.toWorld(screen);
    const hit = this.hitElement(w);
    if (hit) {
      if (hit.type === "text" && !hit.locked) this.editText(hit.id);
      return;
    }
    if (this.tool === "select" || this.tool === "text") this.beginText(w);
  }

  /** Termina a edição. Texto novo vazio some sem rastro; texto antigo esvaziado é apagado (com desfazer). */
  commitText(id: string, text: string): void {
    const el = this.elements.find((e) => e.id === id);
    if (!el || this.editingId !== id) return;
    const wasNew = this.newTextId === id;
    this.editingId = null;
    this.newTextId = null;
    this.cb.onEditText?.(null);

    const clean = text.replace(/\s+$/, ""); // sem espaços nem linhas em branco no fim
    if (clean.trim() === "") {
      this.elements = this.elements.filter((e) => e.id !== id);
      this.setSelection(new Set([...this.selectedIds].filter((s) => s !== id)));
      if (wasNew) this.invalidate();
      else this.commit();
      return;
    }

    const changed = wasNew || clean !== el.text;
    this.elements = this.elements.map((e) =>
      e.id === id ? { ...e, text: clean, ...measureText(clean, e.fontSize ?? DEFAULT_STYLE.fontSize) } : e,
    );
    if (this.tool === "text") {
      this.tool = "select";
      this.cb.onToolChange("select");
    }
    this.setSelection(new Set([id]));
    if (changed) this.commit();
    else this.invalidate();
  }

  // ---- edição: copiar, colar, grupos, camadas, bloqueio, alinhar -------------

  copy(): void {
    const selected = this.getSelected();
    if (selected.length === 0) return;
    clipboard.items = cloneElements(selected, 0);
    clipboard.pasteCount = 0;
  }

  cut(): void {
    this.copy();
    this.deleteSelection();
  }

  paste(): void {
    if (clipboard.items.length === 0) return;
    clipboard.pasteCount += 1; // cada colagem desloca um pouco mais, para não empilhar no mesmo lugar
    const copies = cloneElements(clipboard.items, 20 * clipboard.pasteCount);
    this.elements = [...this.elements, ...copies];
    this.setSelection(new Set(copies.map((c) => c.id)));
    this.commit();
  }

  duplicate(): void {
    const ids = new Set(this.getSelected().map((el) => el.id));
    if (ids.size === 0) return;
    const { elements, newIds } = duplicateElements(this.elements, ids);
    this.elements = elements;
    this.setSelection(new Set(newIds));
    this.commit();
  }

  group(): void {
    const ids = new Set(this.getSelected().map((el) => el.id));
    if (ids.size < 2) return;
    this.elements = groupElements(this.elements, ids);
    this.commit();
  }

  ungroup(): void {
    const ids = new Set(this.getSelected().map((el) => el.id));
    if (ids.size === 0) return;
    const next = ungroupElements(this.elements, ids);
    if (next.every((el, i) => el === this.elements[i])) return;
    this.elements = next;
    this.commit();
  }

  bringToFront(): void {
    this.reorder(bringToFront);
  }

  sendToBack(): void {
    this.reorder(sendToBack);
  }

  bringForward(): void {
    this.reorder(bringForward);
  }

  sendBackward(): void {
    this.reorder(sendBackward);
  }

  toggleLock(): void {
    const ids = new Set(this.selectedIds);
    if (ids.size === 0) return;
    this.elements = toggleLock(this.elements, ids);
    this.commit();
  }

  align(mode: AlignMode): void {
    const next = alignElements(this.elements, new Set(this.selectedIds), mode);
    if (next.every((el, i) => el === this.elements[i])) return;
    this.elements = next;
    this.commit();
  }

  /** Clique direito: seleciona o que está sob o cursor (se já estava na seleção, mantém a seleção). */
  selectAtPoint(screen: Pt): void {
    const hit = this.hitElement(this.toWorld(screen));
    if (!hit) {
      this.clearSelection();
      return;
    }
    if (this.selectedIds.has(hit.id)) return;
    this.setSelection(expandToGroups(this.elements, new Set([hit.id])));
    this.invalidate();
  }

  /** Resumo da seleção para o menu de contexto saber o que habilitar. */
  getSelectionInfo(): { count: number; hasGroup: boolean; allLocked: boolean } {
    const selected = this.getSelected();
    return {
      count: selected.length,
      hasGroup: selected.some((el) => el.groupId !== null),
      allLocked: selected.length > 0 && selected.every((el) => el.locked),
    };
  }

  private reorder(fn: (all: WbElement[], ids: Set<string>) => WbElement[]): void {
    const ids = new Set(this.selectedIds);
    if (ids.size === 0) return;
    const next = fn(this.elements, ids);
    if (next.every((el, i) => el === this.elements[i])) return;
    this.elements = next;
    this.commit();
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

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
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
    if (this.editingId) return; // o campo de texto termina a edição ao perder o foco
    if (p.button === 1 || this.tool === "hand" || this.spaceHeld) {
      this.gesture = { kind: "panning", last: { x: p.x, y: p.y } };
      return;
    }
    if (p.button !== 0) return;
    const w = this.toWorld(p);

    if (this.tool === "select") return this.downSelect(p, w);
    if (this.tool === "text") return this.beginText(w);
    if (SHAPE_TOOLS.includes(this.tool)) return this.downCreate(w);
    if (this.tool === "pencil") return this.downPencil(w);
    if (this.tool === "eraser") return this.downErase(w);
    if (this.tool === "laser") {
      // o laser só deixa rastro: não mexe na cena nem no histórico
      this.trails = addLaserPoint(this.trails, w, this.clock());
      this.gesture = { kind: "laser" };
      this.invalidate();
    }
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
        this.setSelection(expandToGroups(this.elements, new Set([...g.base, ...elementsInRect(this.elements, rect)])));
        break;
      }
      case "panning":
        this.camera = panBy(this.camera, p.x - g.last.x, p.y - g.last.y);
        g.last = { x: p.x, y: p.y };
        break;
      case "erasing":
        this.eraseAt(g, w);
        break;
      case "bending": {
        g.changed = true;
        const snap = 4 / this.camera.zoom; // perto da corda a seta volta a ser reta
        this.elements = g.before.map((el) => {
          if (el.id !== g.id) return el;
          const bend = bendFromHandle(el, w, snap);
          const next = { ...el };
          if (bend) next.bend = bend;
          else delete next.bend;
          return next;
        });
        break;
      }
      case "laser":
        this.trails = addLaserPoint(this.trails, w, this.clock());
        break;
      case "rotating": {
        const cur = Math.atan2(w.y - g.center.y, w.x - g.center.x);
        let angle = g.origAngle + (cur - g.startAngle);
        if (p.shift) {
          const step = Math.PI / 12; // 15°
          angle = Math.round(angle / step) * step;
        }
        g.changed = true;
        this.elements = g.before.map((el) => (el.id === g.id ? { ...el, angle } : el));
        break;
      }
    }
    this.invalidate();
  }

  pointerUp(p: PointerInput): void {
    const g = this.gesture;
    if (!g) return;
    this.gesture = null;
    if (g.kind === "drawing") this.moveDraw(g, this.toWorld(p)); // o ponto onde o mouse foi solto também faz parte do traço

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
      case "rotating":
        if (g.changed) this.commit();
        break;
      case "bending":
        if (g.changed) this.commit();
        break;
      case "laser":
        this.trails = endLaserTrail(this.trails, this.clock());
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
    } else if (g.kind === "laser") {
      this.trails = endLaserTrail(this.trails, this.clock());
    } else if (g.kind !== "panning") {
      this.elements = g.before;
    }
    this.invalidate();
  }

  // ---- gestos: início ---------------------------------------------------

  private downSelect(p: PointerInput, w: Pt): void {
    const selected = this.getSelected();
    // bolinha de curvar do meio de uma seta/linha (só com um elemento selecionado): tem prioridade sobre as alças
    if (selected.length === 1 && !selected[0].locked) {
      const hp = bendHandlePoint(selected[0]);
      if (hp && Math.hypot(w.x - hp.x, w.y - hp.y) <= 8 / this.camera.zoom) {
        this.gesture = { kind: "bending", id: selected[0].id, before: this.elements, changed: false };
        return;
      }
    }
    const frame = selectionFrame(selected, this.camera.zoom);
    if (frame) {
      const handle = handleAtPoint(frame, w, this.camera.zoom);
      if (handle === "rotate" && selected.length === 1) {
        const b = getBounds(selected[0]);
        const center = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
        this.gesture = {
          kind: "rotating",
          id: selected[0].id,
          center,
          startAngle: Math.atan2(w.y - center.y, w.x - center.x),
          origAngle: selected[0].angle,
          before: this.elements,
          changed: false,
        };
        return;
      }
      if (handle && handle !== "rotate") {
        const ids = new Set(selected.filter((el) => !el.locked).map((el) => el.id));
        this.gesture = { kind: "resizing", handle, start: w, before: this.elements, ids, origBounds: frame.bounds, changed: false };
        return;
      }
    }

    const hit = this.hitElement(w);
    if (hit) {
      const members = expandToGroups(this.elements, new Set([hit.id])); // clicar num membro pega o grupo todo
      if (p.shift && this.selectedIds.has(hit.id)) {
        const next = new Set(this.selectedIds);
        for (const id of members) next.delete(id);
        this.setSelection(next);
        this.invalidate();
        return;
      }
      if (p.shift) this.setSelection(new Set([...this.selectedIds, ...members]));
      else if (!this.selectedIds.has(hit.id)) this.setSelection(members);
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
    const el = createElement(type, w.x, w.y, { ...this.defaultStyle, ...(type === "line" || type === "arrow" ? { points: [[0, 0], [0, 0]] } : {}) });
    this.gesture = { kind: "creating", id: el.id, start: w, before: this.elements };
    this.elements = [...this.elements, el];
    this.invalidate();
  }

  private downPencil(w: Pt): void {
    const el = createElement("freedraw", w.x, w.y, { ...this.defaultStyle, points: [[0, 0]] });
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
    this.invalidate(); // operações pelo teclado/menu não passam por pointerUp: sem isto o canvas ficaria desatualizado
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
