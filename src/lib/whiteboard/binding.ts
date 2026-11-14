import type { ElementType, WbElement } from "./types";
import { boundaryPoint, elementCenter, pointInElementBox } from "./geometry";

const BINDABLE: ElementType[] = ["rectangle", "diamond", "ellipse", "text", "note"];
/** Folga entre a ponta da seta e a borda da forma. */
export const BIND_GAP = 2;

export const isBindable = (el: WbElement): boolean => BINDABLE.includes(el.type);

/** Forma sob o ponto p (com folga `margin`) que pode receber uma seta; a de cima ganha. */
export function findBindTarget(elements: WbElement[], p: { x: number; y: number }, margin: number, exclude: Set<string>): WbElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (isBindable(el) && !exclude.has(el.id) && pointInElementBox(el, p, margin)) return el;
  }
  return null;
}

type Pt = { x: number; y: number };
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Recalcula uma seta presa: cada ponta presa vai para a borda da forma, na direção da outra ponta
 * (ou do centro da outra forma). Ponta presa a uma forma que não existe mais fica solta onde estava.
 * A curva mantém o mesmo afastamento do meio da corda.
 */
export function rebindArrow(arrow: WbElement, byId: Map<string, WbElement>): WbElement {
  const bound = arrow.bindings;
  if (!bound || arrow.points?.length !== 2) return arrow;

  const startShape = bound.start ? byId.get(bound.start) : undefined;
  const endShape = bound.end ? byId.get(bound.end) : undefined;
  const bindings: NonNullable<WbElement["bindings"]> = {};
  if (startShape && isBindable(startShape)) bindings.start = startShape.id;
  if (endShape && isBindable(endShape)) bindings.end = endShape.id;

  const a0 = { x: arrow.x + arrow.points[0][0], y: arrow.y + arrow.points[0][1] };
  const b0 = { x: arrow.x + arrow.points[1][0], y: arrow.y + arrow.points[1][1] };
  const na = bindings.start ? boundaryPoint(startShape!, bindings.end ? elementCenter(endShape!) : b0, BIND_GAP) : a0;
  const nb = bindings.end ? boundaryPoint(endShape!, bindings.start ? elementCenter(startShape!) : a0, BIND_GAP) : b0;

  let bend: [number, number] | undefined;
  if (arrow.bend) {
    const oldMid = mid(a0, b0);
    const offset = { x: arrow.x + arrow.bend[0] - oldMid.x, y: arrow.y + arrow.bend[1] - oldMid.y };
    const m = mid(na, nb);
    bend = [m.x + offset.x - na.x, m.y + offset.y - na.y];
  }

  const same =
    Math.abs(na.x - a0.x) < 1e-6 &&
    Math.abs(na.y - a0.y) < 1e-6 &&
    Math.abs(nb.x - b0.x) < 1e-6 &&
    Math.abs(nb.y - b0.y) < 1e-6 &&
    bindings.start === bound.start &&
    bindings.end === bound.end;
  if (same) return arrow;

  const { bindings: _oldBindings, bend: _oldBend, ...rest } = arrow;  
  return {
    ...rest,
    x: na.x,
    y: na.y,
    points: [[0, 0], [nb.x - na.x, nb.y - na.y]],
    ...(bend ? { bend } : {}),
    ...(bindings.start || bindings.end ? { bindings } : {}),
  };
}

/** Tira referências a elementos que não existem mais. Devolve o mesmo array se nada mudou. */
export function pruneBindings(elements: WbElement[]): WbElement[] {
  const ids = new Set(elements.map((e) => e.id));
  let changed = false;
  const out = elements.map((el) => {
    if (!el.bindings) return el;
    const start = el.bindings.start && ids.has(el.bindings.start) ? el.bindings.start : undefined;
    const end = el.bindings.end && ids.has(el.bindings.end) ? el.bindings.end : undefined;
    if (start === el.bindings.start && end === el.bindings.end) return el;
    changed = true;
    const { bindings: _old, ...rest } = el;  
    return start || end ? { ...rest, bindings: { ...(start ? { start } : {}), ...(end ? { end } : {}) } } : rest;
  });
  return changed ? out : elements;
}

/** Recalcula todas as setas presas (depois de qualquer mudança nas formas). Mesmo array se nada mudou. */
export function syncBindings(elements: WbElement[]): WbElement[] {
  if (!elements.some((e) => e.bindings)) return elements;
  const byId = new Map(elements.map((e) => [e.id, e]));
  let changed = false;
  const out = elements.map((el) => {
    if (!el.bindings) return el;
    const next = rebindArrow(el, byId);
    if (next !== el) changed = true;
    return next;
  });
  return changed ? out : elements;
}

/** Só as setas presas às formas em `shapeIds` (usado durante o arrasto, para acompanhar ao vivo). */
export function applyBindings(elements: WbElement[], shapeIds: Set<string>): WbElement[] {
  const byId = new Map(elements.map((e) => [e.id, e]));
  let changed = false;
  const out = elements.map((el) => {
    const b = el.bindings;
    if (!b || !((b.start && shapeIds.has(b.start)) || (b.end && shapeIds.has(b.end)))) return el;
    const next = rebindArrow(el, byId);
    if (next !== el) changed = true;
    return next;
  });
  return changed ? out : elements;
}

/**
 * Arrasta uma ponta da seta até `world`. Com `target`, a ponta prende na forma e encosta na borda;
 * sem alvo, solta a ponta, que fica exatamente onde foi solta. A curva mantém o afastamento do meio da corda.
 */
export function moveEndpoint(arrow: WbElement, which: "start" | "end", world: Pt, target: WbElement | null, byId: Map<string, WbElement>): WbElement {
  if (arrow.points?.length !== 2) return arrow;
  const a0 = { x: arrow.x + arrow.points[0][0], y: arrow.y + arrow.points[0][1] };
  const b0 = { x: arrow.x + arrow.points[1][0], y: arrow.y + arrow.points[1][1] };
  const na = which === "start" ? world : a0;
  const nb = which === "end" ? world : b0;

  const bindings: NonNullable<WbElement["bindings"]> = { ...(arrow.bindings ?? {}) };
  if (arrow.type === "arrow" && target) bindings[which] = target.id;
  else delete bindings[which];

  let bend: [number, number] | undefined;
  if (arrow.bend) {
    const oldMid = mid(a0, b0);
    const m = mid(na, nb);
    bend = [m.x + (arrow.x + arrow.bend[0] - oldMid.x) - na.x, m.y + (arrow.y + arrow.bend[1] - oldMid.y) - na.y];
  }
  const { bindings: _oldBindings, bend: _oldBend, ...rest } = arrow;  
  const moved: WbElement = {
    ...rest,
    x: na.x,
    y: na.y,
    points: [[0, 0], [nb.x - na.x, nb.y - na.y]],
    ...(bend ? { bend } : {}),
    ...(bindings.start || bindings.end ? { bindings } : {}),
  };
  return rebindArrow(moved, byId); // a ponta presa que ficou encosta na borda, olhando para a nova posição
}

/**
 * Durante o arrasto de elementos: seta que se move sem a forma a que estava presa solta aquela ponta;
 * seta cuja forma se move sem ela acompanha a forma.
 */
export function reconcileMoving(elements: WbElement[], movedIds: Set<string>): WbElement[] {
  const unbound = elements.map((el) => {
    if (!el.bindings || !movedIds.has(el.id)) return el;
    const start = el.bindings.start && movedIds.has(el.bindings.start) ? el.bindings.start : undefined;
    const end = el.bindings.end && movedIds.has(el.bindings.end) ? el.bindings.end : undefined;
    if (start === el.bindings.start && end === el.bindings.end) return el;
    const { bindings: _old, ...rest } = el;  
    return start || end ? { ...rest, bindings: { ...(start ? { start } : {}), ...(end ? { end } : {}) } } : rest;
  });
  return applyBindings(unbound, movedIds);
}
