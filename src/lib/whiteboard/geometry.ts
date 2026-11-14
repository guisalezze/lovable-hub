import type { WbElement } from "./types";

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Pt {
  x: number;
  y: number;
}

export type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rotate";

const isLinear = (el: WbElement) => el.type === "line" || el.type === "arrow" || el.type === "freedraw";

function absPoints(el: WbElement): Pt[] {
  return (el.points ?? []).map(([px, py]) => ({ x: el.x + px, y: el.y + py }));
}

/** Caixa sem rotação. Linhas e lápis usam os pontos; formas usam x/y/width/height. */
export function getBounds(el: WbElement): Bounds {
  if (isLinear(el)) {
    const pts = absPoints(el);
    if (pts.length === 0) return { x: el.x, y: el.y, width: 0, height: 0 };
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
  }
  return { x: el.x, y: el.y, width: el.width, height: el.height };
}

export function getSelectionBounds(els: WbElement[]): Bounds | null {
  if (els.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of els) {
    const b = getBounds(el);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function center(b: Bounds): Pt {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Gira o ponto p em torno de c por `angle` radianos (sentido horário na tela). */
function rotate(p: Pt, c: Pt, angle: number): Pt {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}

/** Distância com sinal até o retângulo (negativa por dentro). */
function rectSdf(p: Pt, b: Bounds): number {
  const c = center(b);
  const qx = Math.abs(p.x - c.x) - b.width / 2;
  const qy = Math.abs(p.y - c.y) - b.height / 2;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside;
}

/** Distância aproximada com sinal até a elipse (negativa por dentro). */
function ellipseSdf(p: Pt, b: Bounds): number {
  const a = b.width / 2;
  const h = b.height / 2;
  if (a <= 0 || h <= 0) return rectSdf(p, b);
  const c = center(b);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const k = Math.sqrt((dx / a) ** 2 + (dy / h) ** 2);
  if (k === 0) return -Math.min(a, h);
  const gx = dx / (a * a * k);
  const gy = dy / (h * h * k);
  const grad = Math.hypot(gx, gy);
  return (k - 1) / grad;
}

function diamondSdf(p: Pt, b: Bounds): number {
  const c = center(b);
  const top = { x: c.x, y: b.y };
  const right = { x: b.x + b.width, y: c.y };
  const bottom = { x: c.x, y: b.y + b.height };
  const left = { x: b.x, y: c.y };
  const edge = Math.min(
    distToSegment(p, top, right),
    distToSegment(p, right, bottom),
    distToSegment(p, bottom, left),
    distToSegment(p, left, top),
  );
  const hw = b.width / 2;
  const hh = b.height / 2;
  const inside = hw > 0 && hh > 0 ? Math.abs(p.x - c.x) / hw + Math.abs(p.y - c.y) / hh <= 1 : false;
  return inside ? -edge : edge;
}

export function hitTest(el: WbElement, p: Pt, tolerance: number): boolean {
  const b = getBounds(el);
  const local = el.angle ? rotate(p, center(b), -el.angle) : p;
  const tol = tolerance + el.strokeWidth / 2;

  if (isLinear(el)) {
    const pts = absPoints(el);
    if (pts.length === 0) return false;
    if (pts.length === 1) return Math.hypot(local.x - pts[0].x, local.y - pts[0].y) <= tol;
    for (let i = 0; i < pts.length - 1; i++) {
      if (distToSegment(local, pts[i], pts[i + 1]) <= tol) return true;
    }
    return false;
  }

  if (el.type === "text") return rectSdf(local, b) <= tol; // o texto todo é área clicável, não só as letras

  const sdf = el.type === "ellipse" ? ellipseSdf(local, b) : el.type === "diamond" ? diamondSdf(local, b) : rectSdf(local, b);
  const filled = el.backgroundColor !== "transparent";
  return filled ? sdf <= tol : Math.abs(sdf) <= tol;
}

/** Caixa alinhada aos eixos que contém o elemento já girado. */
export function rotatedAabb(el: WbElement): Bounds {
  const b = getBounds(el);
  if (!el.angle) return b;
  const c = center(b);
  const corners = [
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y },
    { x: b.x + b.width, y: b.y + b.height },
    { x: b.x, y: b.y + b.height },
  ].map((q) => rotate(q, c, el.angle));
  const xs = corners.map((q) => q.x);
  const ys = corners.map((q) => q.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

/** Ids dos elementos que a caixa toca (não precisa conter por inteiro). */
export function elementsInRect(els: WbElement[], rect: Bounds): string[] {
  return els
    .filter((el) => {
      const b = rotatedAabb(el);
      return b.x <= rect.x + rect.width && b.x + b.width >= rect.x && b.y <= rect.y + rect.height && b.y + b.height >= rect.y;
    })
    .map((el) => el.id);
}

const HANDLE_RADIUS = 8; // px de tela
const ROTATE_OFFSET = 24; // px de tela acima da caixa

function handlePoints(b: Bounds, zoom: number, rotatable: boolean): [HandleId, Pt][] {
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const r = b.x + b.width;
  const bt = b.y + b.height;
  const list: [HandleId, Pt][] = [];
  if (rotatable) list.push(["rotate", { x: cx, y: b.y - ROTATE_OFFSET / zoom }]);
  list.push(
    ["nw", { x: b.x, y: b.y }],
    ["n", { x: cx, y: b.y }],
    ["ne", { x: r, y: b.y }],
    ["e", { x: r, y: cy }],
    ["se", { x: r, y: bt }],
    ["s", { x: cx, y: bt }],
    ["sw", { x: b.x, y: bt }],
    ["w", { x: b.x, y: cy }],
  );
  return list;
}

/** Posição (mundo) de cada alça, para o renderizador desenhar. */
export function getHandlePositions(b: Bounds, zoom: number, rotatable: boolean): [HandleId, Pt][] {
  return handlePoints(b, zoom, rotatable);
}

export function getHandleAt(b: Bounds, p: Pt, zoom: number, rotatable: boolean): HandleId | null {
  const radius = HANDLE_RADIUS / zoom;
  let best: HandleId | null = null;
  let bestDist = Infinity;
  for (const [id, pos] of handlePoints(b, zoom, rotatable)) {
    const d = Math.hypot(p.x - pos.x, p.y - pos.y);
    if (d <= radius && d < bestDist) {
      best = id;
      bestDist = d;
    }
  }
  return best;
}

export function resizeBounds(b: Bounds, handle: HandleId, dx: number, dy: number, keepRatio: boolean): Bounds {
  let left = b.x;
  let right = b.x + b.width;
  let top = b.y;
  let bottom = b.y + b.height;

  if (handle.includes("w")) left += dx;
  if (handle.includes("e")) right += dx;
  if (handle.includes("n")) top += dy;
  if (handle.includes("s")) bottom += dy;

  const isCorner = handle.length === 2;
  if (keepRatio && isCorner && b.width > 0 && b.height > 0) {
    // o canto oposto fica parado; o canto arrastado ajusta para manter a proporção
    const anchorX = handle.includes("w") ? b.x + b.width : b.x;
    const anchorY = handle.includes("n") ? b.y + b.height : b.y;
    const dragX = handle.includes("w") ? left : right;
    const dragY = handle.includes("n") ? top : bottom;
    const w = dragX - anchorX;
    const h = dragY - anchorY;
    const scale = Math.max(Math.abs(w) / b.width, Math.abs(h) / b.height);
    const nw = Math.sign(w || 1) * b.width * scale;
    const nh = Math.sign(h || 1) * b.height * scale;
    left = Math.min(anchorX, anchorX + nw);
    right = Math.max(anchorX, anchorX + nw);
    top = Math.min(anchorY, anchorY + nh);
    bottom = Math.max(anchorY, anchorY + nh);
  }

  return {
    x: Math.min(left, right),
    y: Math.min(top, bottom),
    width: Math.abs(right - left),
    height: Math.abs(bottom - top),
  };
}

/** Leva coordenadas de dentro da caixa `from` para a caixa `to` (entra e sai em coordenadas absolutas). */
export function scalePoints(points: [number, number][], from: Bounds, to: Bounds): [number, number][] {
  const sx = from.width === 0 ? 1 : to.width / from.width;
  const sy = from.height === 0 ? 1 : to.height / from.height;
  return points.map(([px, py]) => [to.x + (px - from.x) * sx, to.y + (py - from.y) * sy]);
}

/** Moldura de seleção: caixa, ângulo e quais alças existem. */
export interface SelectionFrame {
  bounds: Bounds;
  angle: number;
  handles: [HandleId, Pt][];
}

/**
 * Regras das alças:
 * - um elemento reto: oito de tamanho + girar;
 * - um elemento girado: só a de girar;
 * - vários: só as de tamanho (sem girar);
 * - tudo bloqueado: caixa sem alças.
 */
export function selectionFrame(selected: WbElement[], zoom: number): SelectionFrame | null {
  if (selected.length === 0) return null;
  if (selected.length === 1) {
    const el = selected[0];
    const bounds = getBounds(el);
    if (el.locked) return { bounds, angle: el.angle, handles: [] };
    const all = handlePoints(bounds, zoom, true);
    return { bounds, angle: el.angle, handles: el.angle ? all.filter(([id]) => id === "rotate") : all };
  }
  const bounds = getSelectionBounds(selected)!;
  if (selected.every((e) => e.locked)) return { bounds, angle: 0, handles: [] };
  return { bounds, angle: 0, handles: handlePoints(bounds, zoom, false) };
}

/** Alça sob o ponto p (coordenadas do mundo), respeitando a rotação da moldura. */
export function handleAtPoint(frame: SelectionFrame, p: Pt, zoom: number): HandleId | null {
  if (frame.handles.length === 0) return null;
  const local = frame.angle ? rotate(p, center(frame.bounds), -frame.angle) : p;
  const id = getHandleAt(frame.bounds, local, zoom, frame.handles.some(([h]) => h === "rotate"));
  return id && frame.handles.some(([h]) => h === id) ? id : null;
}
