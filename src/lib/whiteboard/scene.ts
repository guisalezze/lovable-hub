import type { ElementType, Scene, WbElement } from "./types";

const ELEMENT_TYPES: ElementType[] = ["rectangle", "diamond", "ellipse", "line", "arrow", "freedraw", "text"];

export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

export function createElement(
  type: ElementType,
  x: number,
  y: number,
  style: Partial<WbElement> = {},
): WbElement {
  return {
    id: newId(),
    type,
    x,
    y,
    width: 0,
    height: 0,
    angle: 0,
    strokeColor: "auto",
    backgroundColor: "transparent",
    strokeWidth: 2,
    roundness: "round",
    seed: newSeed(),
    groupId: null,
    locked: false,
    ...style,
  };
}

export function serializeScene(elements: WbElement[]): Scene {
  return { version: 1, elements };
}

type ParseResult = { ok: true; elements: WbElement[] } | { ok: false; error: string };

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function isPoints(v: unknown): boolean {
  return Array.isArray(v) && v.every((p) => Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]));
}

function elementError(raw: unknown, index: number): string | null {
  const at = `elemento ${index + 1}`;
  if (!raw || typeof raw !== "object") return `${at}: formato inválido`;
  const e = raw as Record<string, unknown>;
  if (!ELEMENT_TYPES.includes(e.type as ElementType)) return `${at}: tipo desconhecido (${String(e.type)})`;
  if (typeof e.id !== "string" || !e.id) return `${at}: id inválido`;
  for (const k of ["x", "y", "width", "height", "angle", "strokeWidth", "seed"]) {
    if (!isNum(e[k])) return `${at}: campo "${k}" inválido`;
  }
  for (const k of ["strokeColor", "backgroundColor"]) {
    if (typeof e[k] !== "string") return `${at}: campo "${k}" inválido`;
  }
  if (e.roundness !== "sharp" && e.roundness !== "round") return `${at}: campo "roundness" inválido`;
  if (typeof e.locked !== "boolean") return `${at}: campo "locked" inválido`;
  if (e.groupId !== null && typeof e.groupId !== "string") return `${at}: campo "groupId" inválido`;
  if (e.text !== undefined && typeof e.text !== "string") return `${at}: campo "text" inválido`;
  if (e.fontSize !== undefined && !isNum(e.fontSize)) return `${at}: campo "fontSize" inválido`;
  if (e.points !== undefined && !isPoints(e.points)) return `${at}: campo "points" inválido`;
  return null;
}

/** Valida o formato sem "consertar" nada: dado estranho vira erro, nunca perda silenciosa. */
export function parseScene(raw: unknown): ParseResult {
  if (!raw || typeof raw !== "object") return { ok: false, error: "A cena não é um objeto válido." };
  const s = raw as Record<string, unknown>;
  if (s.version !== 1) {
    return { ok: false, error: `Este quadro usa uma versão de formato desconhecida (versão ${String(s.version)}).` };
  }
  if (!Array.isArray(s.elements)) return { ok: false, error: "A lista de elementos do quadro está inválida." };
  for (let i = 0; i < s.elements.length; i++) {
    const err = elementError(s.elements[i], i);
    if (err) return { ok: false, error: err };
  }
  return { ok: true, elements: s.elements as WbElement[] };
}
