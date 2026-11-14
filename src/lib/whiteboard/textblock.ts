import type { ElementType, WbElement } from "./types";
import { layoutText, type TextLayout } from "./layout";
import { elementRuns, plainFromRuns } from "./richtext";
import { DEFAULT_STYLE } from "./palette";

/** Elementos que guardam texto. */
export const TEXT_TYPES: ElementType[] = ["text", "note", "rectangle", "diamond", "ellipse"];

export const NOTE_PADDING = 12;
export const SHAPE_PADDING = 10;
export const NOTE_DEFAULT_SIZE = { width: 180, height: 140 };
/** Aparência de uma nota nova: papel amarelo e letra escura (lê bem em qualquer tema do CRM). */
export const NOTE_DEFAULT_STYLE = { backgroundColor: "#ffd43b", strokeColor: "#1e1e1e", fontSize: 20 };

export const hasText = (el: WbElement): boolean => TEXT_TYPES.includes(el.type) && plainFromRuns(elementRuns(el)).length > 0;

export interface TextBlock {
  layout: TextLayout;
  /** Canto superior esquerdo do bloco, em coordenadas do mundo. */
  x: number;
  y: number;
}

/** Largura em que o texto de uma forma ou nota quebra (com a margem interna). */
export function textMaxWidth(el: WbElement): number {
  const pad = el.type === "note" ? NOTE_PADDING : SHAPE_PADDING;
  const usable = el.type === "ellipse" || el.type === "diamond" ? el.width * 0.7 : el.width - 2 * pad;
  return Math.max(usable, 10);
}

/**
 * Onde o texto de um elemento fica e como quebra:
 * texto solto — começa no canto e não quebra sozinho;
 * nota — canto de cima, à esquerda, quebrando na largura da nota;
 * forma — centrado, quebrando dentro da margem (elipse e losango usam só 70% da largura).
 */
export function textBlockFor(el: WbElement): TextBlock {
  const fontSize = el.fontSize ?? DEFAULT_STYLE.fontSize;
  const base = { fontSize, fontFamily: el.fontFamily ?? DEFAULT_STYLE.fontFamily };
  const runs = elementRuns(el);

  if (el.type === "text") {
    return { layout: layoutText(runs, { ...base, align: el.textAlign ?? "left" }), x: el.x, y: el.y };
  }

  const isNote = el.type === "note";
  const pad = isNote ? NOTE_PADDING : SHAPE_PADDING;
  const maxWidth = textMaxWidth(el);
  const layout = layoutText(runs, { ...base, maxWidth, align: el.textAlign ?? (isNote ? "left" : "center") });
  return {
    layout,
    x: el.x + (el.width - maxWidth) / 2,
    y: isNote ? el.y + pad : el.y + (el.height - layout.height) / 2,
  };
}

/** O elemento acompanha o texto: texto solto toma o tamanho dele; nota cresce (nunca encolhe); formas ficam como estão. */
export function refitElement(el: WbElement): WbElement {
  if (el.type === "text") {
    const { layout } = textBlockFor(el);
    const min = (el.fontSize ?? DEFAULT_STYLE.fontSize) * 0.5;
    return { ...el, width: Math.max(layout.width, min), height: layout.height };
  }
  if (el.type === "note") {
    const needed = textBlockFor(el).layout.height + 2 * NOTE_PADDING;
    return needed > el.height ? { ...el, height: needed } : el;
  }
  return el;
}
