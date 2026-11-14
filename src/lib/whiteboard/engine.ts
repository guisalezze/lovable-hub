import type { Camera, ElementType, LaserTrail, StylePatch, Tool, WbElement } from "./types";
import { DEFAULT_STYLE } from "./palette";
import { addLaserPoint, endLaserTrail, pruneLaser } from "./laser";
import { NOTE_DEFAULT_SIZE, NOTE_DEFAULT_STYLE, TEXT_TYPES, refitElement } from "./textblock";
import { elementRuns, normalizeRuns, plainFromRuns, runsFromPlain, trimRunsEnd } from "./richtext";
import type { TextRun } from "./types";
import { computeSnap, type Guide } from "./snap";
import { applyBindings, findBindTarget, isBindable, moveEndpoint, pruneBindings, reconcileMoving, syncBindings } from "./binding";
import {
  alignElements,
  bringForward,
  bringToFront,
  clipboard,
  styleClipboard,
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
import { cropResize, defaultSizeFor, resetCrop, toggleFlip, type MediaKind } from "./imageops";
import { History } from "./history";
import { panBy, screenToWorld } from "./camera";
import {
  bendFromHandle,
  bendHandlePoint,
  elementsInRect,
  endpointHandles,
  getSelectionBounds,
  rotatedAabb,
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
  | { kind: "endpoint"; id: string; which: "start" | "end"; before: WbElement[]; changed: boolean }
  | { kind: "cropping"; id: string; handle: HandleId; start: Pt; before: WbElement[]; changed: boolean }
  | { kind: "rotating"; id: string; center: Pt; startAngle: number; origAngle: number; before: WbElement[]; changed: boolean };

const SHAPE_TOOLS: Tool[] = ["rectangle", "diamond", "ellipse", "line", "arrow", "note"];
const TEXT_STYLE_KEYS = ["fontSize", "fontFamily", "textAlign"] as const;
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
    return refitElement({ ...el, x: to.x + (el.x - from.x) * sx, y: to.y + (el.y - from.y) * sy, fontSize });
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
  /** Forma que vai receber a ponta da seta que está sendo desenhada/arrastada (a interface a destaca). */
  bindHighlightId: string | null = null;
  /** Linhas-guia do alinhamento automático durante o arrasto. */
  guides: Guide[] = [];
  /** Posição do mouse no mundo (para a régua). */
  cursor: Pt | null = null;
  rulerOn = false;
  /** Id do texto que está sendo escrito agora (o campo de texto da interface cuida dele). */
  editingId: string | null = null;
  private newTextId: string | null = null;
  /** Como o elemento estava ao começar a edição (para saber se algo mudou ao confirmar). */
  private editBase: WbElement | null = null;
  /** Imagem em modo de corte (as alças cortam em vez de redimensionar). */
  cropId: string | null = null;
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
  applyStyle(patch: StylePatch, opts: { setDefault?: boolean } = {}): void {
    if (opts.setDefault !== false) this.defaultStyle = { ...this.defaultStyle, ...patch };
    const targets = new Set(this.getSelected().filter((el) => !el.locked).map((el) => el.id));
    if (targets.size === 0) {
      this.invalidate();
      return;
    }
    const keys = (Object.keys(patch) as (keyof StylePatch)[]).filter((k) => patch[k] !== undefined);
    let changed = false;
    this.elements = this.elements.map((el) => {
      if (!targets.has(el.id)) return el;
      // tamanho, fonte e alinhamento só valem para quem guarda texto
      const applicable = keys.filter((k) => !(TEXT_STYLE_KEYS as readonly string[]).includes(k) || TEXT_TYPES.includes(el.type));
      if (!applicable.some((k) => el[k] !== patch[k])) return el;
      changed = true;
      const next: WbElement = { ...el };
      for (const k of applicable) (next as unknown as Record<string, unknown>)[k] = patch[k];
      if (applicable.some((k) => (TEXT_STYLE_KEYS as readonly string[]).includes(k))) return refitElement(next);
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
      ...this.textStyleOf(selected),
    };
  }

  /** Valor comum de tamanho, fonte e alinhamento entre os elementos com texto da seleção. */
  private textStyleOf(selected: WbElement[]): StylePatch {
    const texts = selected.filter((el) => TEXT_TYPES.includes(el.type));
    const common = <K extends (typeof TEXT_STYLE_KEYS)[number]>(key: K, fallback: StylePatch[K]): StylePatch[K] => {
      if (texts.length === 0) return undefined;
      const first = texts[0][key] ?? fallback;
      return texts.every((t) => (t[key] ?? fallback) === first) ? first : undefined;
    };
    return {
      fontSize: common("fontSize", DEFAULT_STYLE.fontSize),
      fontFamily: common("fontFamily", DEFAULT_STYLE.fontFamily),
      textAlign: common("textAlign", DEFAULT_STYLE.textAlign),
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

  /** Começa um texto solto novo em w (coordenadas do mundo). Só entra no histórico quando confirmado com conteúdo. */
  beginText(w: Pt): void {
    const fontSize = this.defaultStyle.fontSize ?? DEFAULT_STYLE.fontSize;
    const el = refitElement(createElement("text", w.x, w.y, { ...this.defaultStyle, text: "", fontSize }));
    this.elements = [...this.elements, el];
    this.newTextId = el.id;
    this.editBase = null;
    this.editingId = el.id;
    this.setSelection(new Set());
    this.cb.onEditText?.(el.id);
    this.invalidate();
  }

  /** Abre a edição do texto de um elemento que já existe (texto solto, nota ou forma). */
  editText(id: string): void {
    const el = this.elements.find((e) => e.id === id && TEXT_TYPES.includes(e.type));
    if (!el) return;
    this.newTextId = null;
    this.editBase = el;
    this.editingId = id;
    this.setSelection(new Set([id]));
    this.cb.onEditText?.(id);
    this.invalidate();
  }

  /** O elemento que está sendo editado agora (com as mudanças de fonte/alinhamento feitas durante a edição). */
  getEditingElement(): WbElement | null {
    return this.elements.find((e) => e.id === this.editingId) ?? null;
  }

  /** Muda tamanho, fonte ou alinhamento do que está sendo escrito. Sem histórico: entra junto com o texto, ao confirmar. */
  updateEditing(patch: Pick<StylePatch, "fontSize" | "fontFamily" | "textAlign">): void {
    const id = this.editingId;
    if (!id) return;
    this.defaultStyle = { ...this.defaultStyle, ...patch };
    this.elements = this.elements.map((e) => (e.id === id ? refitElement({ ...e, ...patch }) : e));
    this.invalidate();
  }

  /** Duplo clique: edita o texto do elemento sob o cursor (ou da forma que contém o ponto), ou cria um texto novo no vazio. */
  doubleClick(screen: Pt): void {
    if (this.editingId) return;
    const w = this.toWorld(screen);
    const hit = this.hitElement(w);
    if (hit) {
      if (hit.type === "image" && !hit.locked) {
        this.setSelection(new Set([hit.id]));
        this.startCrop();
        return;
      }
      if (TEXT_TYPES.includes(hit.type) && !hit.locked) this.editText(hit.id);
      return;
    }
    // forma sem preenchimento: só a borda "acerta", mas duplo clique no meio dela também edita o texto dela
    const container = findBindTarget(this.elements, w, 0, new Set());
    if (container) {
      if (!container.locked) this.editText(container.id);
      return;
    }
    if (this.tool === "select" || this.tool === "text") this.beginText(w);
  }

  commitText(id: string, text: string): void {
    this.commitRuns(id, runsFromPlain(text));
  }

  /**
   * Termina a edição com o texto (com estilo) dado.
   * Texto solto vazio some (sem rastro se era novo; com desfazer se já existia). Forma ou nota esvaziada só perde o texto.
   */
  commitRuns(id: string, runs: TextRun[]): void {
    const el = this.elements.find((e) => e.id === id);
    if (!el || this.editingId !== id) return;
    const wasNew = this.newTextId === id;
    const base = this.editBase;
    this.editingId = null;
    this.newTextId = null;
    this.editBase = null;
    this.cb.onEditText?.(null);

    const clean = normalizeRuns(trimRunsEnd(runs));
    const plain = plainFromRuns(clean);

    if (plain.trim() === "") {
      if (el.type === "text") {
        this.elements = this.elements.filter((e) => e.id !== id);
        this.setSelection(new Set([...this.selectedIds].filter((s) => s !== id)));
        if (wasNew) this.invalidate();
        else this.commit();
        return;
      }
      const hadText = !!(base && (base.text || base.runs?.length));
      this.elements = this.elements.map((e) => {
        if (e.id !== id) return e;
        const { text: _text, runs: _runs, ...rest } = e;  
        return rest;
      });
      this.setSelection(new Set([id]));
      if (hadText) this.commit();
      else this.invalidate();
      return;
    }

    const next = refitElement({ ...el, text: plain, runs: clean });
    // mudou de verdade? compara o conteúdo e o estilo (não o tamanho, que é recalculado a partir deles)
    const key = (e: WbElement) => JSON.stringify([normalizeRuns(elementRuns(e)), e.fontSize, e.fontFamily, e.textAlign]);
    const changed = wasNew || !base || key(base) !== key(next);
    if (changed) this.elements = this.elements.map((e) => (e.id === id ? next : e));
    if (this.tool === "text") {
      this.tool = "select";
      this.cb.onToolChange("select");
    }
    this.setSelection(new Set([id]));
    if (changed) this.commit();
    else this.invalidate();
  }

  // ---- mídia: inserir, espelhar, girar, cortar -------------------------------

  /** Põe um arquivo já guardado no quadro, centralizado em `center` (mundo), e o seleciona. */
  addMedia(info: { fileId: string; mime: string; fileName: string; kind: MediaKind; natural: { width: number; height: number } | null }, center: Pt): WbElement {
    const size = defaultSizeFor(info.kind, info.natural);
    const el = createElement(info.kind === "image" ? "image" : "media", center.x - size.width / 2, center.y - size.height / 2, {
      width: size.width,
      height: size.height,
      fileId: info.fileId,
      mime: info.mime,
      fileName: info.fileName,
      ...(info.natural ? { natural: info.natural } : {}),
    });
    this.elements = [...this.elements, el];
    this.tool = "select";
    this.cb.onToolChange("select");
    this.setSelection(new Set([el.id]));
    this.commit();
    return el;
  }

  private mediaTargets(only?: "image"): WbElement[] {
    return this.getSelected().filter((el) => !el.locked && (el.type === "image" || (!only && el.type === "media")));
  }

  flipSelected(axis: "x" | "y"): void {
    const ids = new Set(this.mediaTargets("image").map((e) => e.id));
    if (ids.size === 0) return;
    this.elements = this.elements.map((e) => (ids.has(e.id) ? toggleFlip(e, axis) : e));
    this.commit();
  }

  /** Gira a imagem 90° no sentido horário (o ângulo do elemento, então a caixa gira junto). */
  rotateSelected90(): void {
    const ids = new Set(this.mediaTargets().map((e) => e.id));
    if (ids.size === 0) return;
    this.elements = this.elements.map((e) => (ids.has(e.id) ? { ...e, angle: (e.angle + Math.PI / 2) % (Math.PI * 2) } : e));
    this.commit();
  }

  startCrop(): void {
    const sel = this.getSelected();
    if (sel.length !== 1 || sel[0].type !== "image" || sel[0].locked) return;
    this.cropId = sel[0].id;
    this.invalidate();
  }

  endCrop(): void {
    if (!this.cropId) return;
    this.cropId = null;
    this.invalidate();
  }

  /** Volta a imagem selecionada para inteira. */
  resetSelectedCrop(): void {
    const ids = new Set(this.mediaTargets("image").map((e) => e.id));
    let changed = false;
    this.elements = this.elements.map((e) => {
      if (!ids.has(e.id)) return e;
      const r = resetCrop(e);
      if (r !== e) changed = true;
      return r;
    });
    this.cropId = null;
    if (changed) this.commit();
    else this.invalidate();
  }

  // ---- formatação e régua ---------------------------------------------------

  /** Copia a formatação do primeiro selecionado (cor, fundo, espessura, cantos, letra). */
  copyStyle(): void {
    const first = this.getSelected()[0];
    if (!first) return;
    const style: Record<string, unknown> = {};
    for (const k of ["strokeColor", "backgroundColor", "strokeWidth", "roundness", "fontSize", "fontFamily", "textAlign"] as const) {
      if (first[k] !== undefined) style[k] = first[k];
    }
    styleClipboard.style = style as StylePatch;
  }

  /** Cola a formatação copiada na seleção (um passo de histórico; não muda o padrão das próximas formas). */
  pasteStyle(): void {
    if (styleClipboard.style) this.applyStyle(styleClipboard.style, { setDefault: false });
  }

  setRuler(on: boolean): void {
    this.rulerOn = on;
    this.invalidate();
  }

  /** O mouse saiu do quadro: some a régua da tela. */
  pointerLeave(): void {
    this.cursor = null;
    if (this.rulerOn) this.invalidate();
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

  /** Ponto da tela (relativo ao canvas) no mundo. */
  screenToWorldPoint(p: Pt): Pt {
    return this.toWorld(p);
  }

  /** Resumo da seleção para o menu de contexto saber o que habilitar. */
  getSelectionInfo(): { count: number; hasGroup: boolean; allLocked: boolean; hasImage: boolean; hasCrop: boolean } {
    const selected = this.getSelected();
    return {
      count: selected.length,
      hasGroup: selected.some((el) => el.groupId !== null),
      allLocked: selected.length > 0 && selected.every((el) => el.locked),
      hasImage: selected.some((el) => el.type === "image"),
      hasCrop: selected.some((el) => el.type === "image" && !!el.crop),
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
    this.cropId = null;
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
    const w = this.toWorld(p);
    this.cursor = w;
    if (!g) {
      if (this.rulerOn) this.invalidate(); // a régua acompanha o mouse
      return;
    }

    switch (g.kind) {
      case "creating":
        this.moveCreate(g, w, p.shift);
        this.bindHighlightId = this.tool === "arrow" ? (findBindTarget(g.before, w, 8 / this.camera.zoom, new Set())?.id ?? null) : null;
        break;
      case "drawing":
        this.moveDraw(g, w);
        break;
      case "moving": {
        let dx = w.x - g.start.x;
        let dy = w.y - g.start.y;
        g.moved = g.moved || dx !== 0 || dy !== 0;
        this.guides = [];
        if (!p.ctrl && (dx !== 0 || dy !== 0)) {
          // alinhamento automático: encaixa bordas e centros nos das outras formas (Ctrl solta)
          const movingBounds = getSelectionBounds(g.before.filter((el) => g.ids.has(el.id)));
          if (movingBounds) {
            const others = g.before.filter((el) => !g.ids.has(el.id) && isBindable(el)).map(rotatedAabb);
            const snap = computeSnap({ ...movingBounds, x: movingBounds.x + dx, y: movingBounds.y + dy }, others, 6 / this.camera.zoom);
            dx += snap.dx;
            dy += snap.dy;
            this.guides = snap.guides;
          }
        }
        const moved = g.before.map((el) => (g.ids.has(el.id) ? { ...el, x: el.x + dx, y: el.y + dy } : el));
        this.elements = reconcileMoving(moved, g.ids); // setas presas acompanham (ou soltam)
        break;
      }
      case "resizing": {
        const next = resizeBounds(g.origBounds, g.handle, w.x - g.start.x, w.y - g.start.y, p.shift);
        g.changed = true;
        this.elements = applyBindings(
          g.before.map((el) => (g.ids.has(el.id) ? transformElement(el, g.origBounds, next) : el)),
          g.ids,
        );
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
      case "endpoint": {
        g.changed = true;
        const arrow = g.before.find((e) => e.id === g.id)!;
        const target = arrow.type === "arrow" ? findBindTarget(g.before, w, 8 / this.camera.zoom, new Set([g.id])) : null;
        this.bindHighlightId = target ? target.id : null;
        const byId = new Map(g.before.map((e) => [e.id, e]));
        const moved = moveEndpoint(arrow, g.which, w, target, byId);
        this.elements = g.before.map((e) => (e.id === g.id ? moved : e));
        break;
      }
      case "laser":
        this.trails = addLaserPoint(this.trails, w, this.clock());
        break;
      case "cropping": {
        g.changed = true;
        this.elements = g.before.map((el) => (el.id === g.id ? cropResize(el, g.handle, w.x - g.start.x, w.y - g.start.y) : el));
        break;
      }
      case "rotating": {
        const cur = Math.atan2(w.y - g.center.y, w.x - g.center.x);
        let angle = g.origAngle + (cur - g.startAngle);
        if (p.shift) {
          const step = Math.PI / 12; // 15°
          angle = Math.round(angle / step) * step;
        }
        g.changed = true;
        this.elements = applyBindings(
          g.before.map((el) => (el.id === g.id ? { ...el, angle } : el)),
          new Set([g.id]),
        );
        break;
      }
    }
    this.invalidate();
  }

  pointerUp(p: PointerInput): void {
    const g = this.gesture;
    if (!g) return;
    this.gesture = null;
    this.guides = [];
    this.bindHighlightId = null;
    if (g.kind === "drawing") this.moveDraw(g, this.toWorld(p)); // o ponto onde o mouse foi solto também faz parte do traço

    switch (g.kind) {
      case "creating": {
        let el = this.elements.find((e) => e.id === g.id);
        const min = MIN_SHAPE / this.camera.zoom;
        let tooSmall = !el || (el.width < min && el.height < min);
        if (el && el.type === "note" && tooSmall) {
          // um clique com a ferramenta de nota cria uma nota de tamanho padrão
          el = { ...el, ...NOTE_DEFAULT_SIZE };
          const sized = el;
          this.elements = this.elements.map((e) => (e.id === g.id ? sized : e));
          tooSmall = false;
        }
        if (tooSmall) {
          this.elements = g.before;
        } else {
          this.bindNewArrow(g.id, g.start, g.before);
          this.tool = "select";
          this.cb.onToolChange("select");
          this.setSelection(new Set([g.id]));
          this.commit();
          if (el && el.type === "note") this.editText(g.id); // nota nova já abre para escrever
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
      case "cropping":
      case "rotating":
        if (g.changed) this.commit();
        break;
      case "bending":
      case "endpoint":
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
    this.guides = [];
    this.bindHighlightId = null;
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
    // alças das pontas de uma seta/linha de 2 pontos
    if (selected.length === 1 && !selected[0].locked) {
      const eh = endpointHandles(selected[0]);
      if (eh) {
        const ds = Math.hypot(w.x - eh.start.x, w.y - eh.start.y);
        const de = Math.hypot(w.x - eh.end.x, w.y - eh.end.y);
        if (Math.min(ds, de) <= 8 / this.camera.zoom) {
          this.gesture = { kind: "endpoint", id: selected[0].id, which: ds <= de ? "start" : "end", before: this.elements, changed: false };
          return;
        }
      }
    }
    if (this.cropId) {
      const target = selected.length === 1 && selected[0].id === this.cropId ? selected[0] : null;
      const cf = target ? selectionFrame([target], this.camera.zoom) : null;
      const ch = cf ? handleAtPoint(cf, w, this.camera.zoom) : null;
      if (target && ch && ch !== "rotate") {
        this.gesture = { kind: "cropping", id: target.id, handle: ch, start: w, before: this.elements, changed: false };
        return;
      }
      this.cropId = null; // clicar fora termina o corte
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
    const ds = this.defaultStyle;
    const noteStyle =
      type === "note"
        ? {
            backgroundColor: ds.backgroundColor && ds.backgroundColor !== "transparent" ? ds.backgroundColor : NOTE_DEFAULT_STYLE.backgroundColor,
            strokeColor: ds.strokeColor && ds.strokeColor !== "auto" ? ds.strokeColor : NOTE_DEFAULT_STYLE.strokeColor,
            fontSize: ds.fontSize ?? NOTE_DEFAULT_STYLE.fontSize,
          }
        : {};
    const el = createElement(type, w.x, w.y, { ...ds, ...noteStyle, ...(type === "line" || type === "arrow" ? { points: [[0, 0], [0, 0]] } : {}) });
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
  /** Seta recém-criada: prende as pontas às formas sob elas (menos se as duas pontas caírem na mesma forma). */
  private bindNewArrow(id: string, start: Pt, before: WbElement[]): void {
    const el = this.elements.find((e) => e.id === id);
    if (!el || el.type !== "arrow" || !el.points) return;
    const margin = 8 / this.camera.zoom;
    const s = findBindTarget(before, start, margin, new Set());
    const e = findBindTarget(before, { x: el.x + el.points[1][0], y: el.y + el.points[1][1] }, margin, new Set());
    if ((s && e && s.id === e.id) || (!s && !e)) return;
    const bindings = { ...(s ? { start: s.id } : {}), ...(e ? { end: e.id } : {}) };
    this.elements = this.elements.map((x) => (x.id === id ? { ...x, bindings } : x));
  }

  private commit(): void {
    this.elements = syncBindings(pruneBindings(this.elements)); // forma apagada solta a seta; mudanças nas formas reposicionam as pontas
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
