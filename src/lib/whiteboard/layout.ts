import type { FontFamily, TextAlign, TextRun } from "./types";
import { TEXT_LINE_HEIGHT, canvasMeasure } from "./text";

export const FONT_FAMILIES: Record<FontFamily, string> = {
  sans: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"Cascadia Code", Consolas, "Courier New", monospace',
  hand: '"Segoe Print", "Comic Sans MS", "Bradley Hand", cursive',
};

export interface FontSpec {
  size: number;
  family: FontFamily;
  bold: boolean;
  italic: boolean;
}

export type Measure = (text: string, font: FontSpec) => number;

/** Fonte no formato do canvas (ctx.font). */
export function fontString(f: FontSpec): string {
  return `${f.italic ? "italic " : ""}${f.bold ? "700 " : ""}${f.size}px ${FONT_FAMILIES[f.family]}`;
}

export interface Segment {
  text: string;
  style: Omit<TextRun, "text">;
  /** Posição horizontal dentro do bloco (já com recuo e alinhamento). */
  x: number;
  width: number;
}

export interface LayoutLine {
  segments: Segment[];
  /** Marcador da lista ("•", "1.", ...), desenhado em `markerX`. */
  marker?: string;
  markerX: number;
  /** Recuo do texto em relação ao marcador. */
  indent: number;
  /** Largura do texto da linha (sem o recuo). */
  width: number;
  y: number;
  height: number;
}

export interface TextLayout {
  lines: LayoutLine[];
  width: number;
  height: number;
}

export interface LayoutOptions {
  fontSize: number;
  fontFamily?: FontFamily;
  align?: TextAlign;
  /** Sem isto, o texto não quebra sozinho (só nas quebras de linha dadas). */
  maxWidth?: number;
  lineHeight?: number;
  measure?: Measure;
}

const BULLET = /^(?:- |• )/;
const NUMBERED = /^(\d+)\. /;

interface Token {
  text: string;
  style: Omit<TextRun, "text">;
  space: boolean;
}

const styleOf = (r: TextRun): Omit<TextRun, "text"> => {
  const { text: _text, ...style } = r;  
  return style;
};

/** Parte os trechos em parágrafos (cada "\n" abre um novo). */
function paragraphsOf(runs: TextRun[]): TextRun[][] {
  const paragraphs: TextRun[][] = [[]];
  for (const r of runs) {
    r.text.split("\n").forEach((piece, i) => {
      if (i > 0) paragraphs.push([]);
      if (piece) paragraphs[paragraphs.length - 1].push({ ...r, text: piece });
    });
  }
  return paragraphs;
}

/** Tira os primeiros `n` caracteres de um parágrafo, atravessando trechos. */
function stripPrefix(par: TextRun[], n: number): TextRun[] {
  const out: TextRun[] = [];
  let left = n;
  for (const r of par) {
    if (left >= r.text.length) {
      left -= r.text.length;
      continue;
    }
    out.push({ ...r, text: r.text.slice(left) });
    left = 0;
  }
  return out;
}

/**
 * Calcula onde cada pedaço de texto fica: quebra de linha automática (se `maxWidth`), estilos por trecho,
 * alinhamento e listas ("- " e "1. " no começo da linha viram marcadores, com recuo e numeração automática).
 * `measure` mede um texto numa fonte (o padrão usa o canvas do navegador).
 */
export function layoutText(runs: TextRun[], opts: LayoutOptions): TextLayout {
  const fontSize = Math.max(1, Number.isFinite(opts.fontSize) ? opts.fontSize : 1);
  const family = opts.fontFamily ?? "sans";
  const align = opts.align ?? "left";
  const measure = opts.measure ?? canvasMeasure;
  const lineH = fontSize * (opts.lineHeight ?? TEXT_LINE_HEIGHT);
  const maxWidth = opts.maxWidth;
  const markerGap = fontSize * 1.3;

  const fontFor = (s: Omit<TextRun, "text">): FontSpec => ({ size: fontSize, family, bold: !!s.bold, italic: !!s.italic });
  const widthOf = (text: string, s: Omit<TextRun, "text">) => measure(text, fontFor(s));

  interface RawLine {
    segments: { text: string; style: Omit<TextRun, "text"> }[];
    marker?: string;
    indent: number;
  }
  const raw: RawLine[] = [];
  let counter = 0;

  for (const original of paragraphsOf(runs)) {
    const plain = original.map((r) => r.text).join("");
    let par = original;
    let marker: string | undefined;
    const num = NUMBERED.exec(plain);
    if (BULLET.test(plain)) {
      marker = "•";
      par = stripPrefix(par, 2);
      counter = 0;
    } else if (num) {
      counter += 1;
      marker = `${counter}.`;
      par = stripPrefix(par, num[0].length);
    } else {
      counter = 0;
    }
    const indent = marker ? markerGap : 0;
    const avail = maxWidth === undefined ? Infinity : Math.max(maxWidth - indent, 1);

    // palavras e espaços, cada um com o estilo do seu trecho
    const tokens: Token[] = [];
    for (const r of par) {
      for (const piece of r.text.split(/(\s+)/)) {
        if (piece) tokens.push({ text: piece, style: styleOf(r), space: /^\s+$/.test(piece) });
      }
    }

    let line: RawLine = { segments: [], marker, indent };
    let lineW = 0;
    let pending: Token[] = [];
    let pendingW = 0;
    const flush = (): void => {
      raw.push(line);
      line = { segments: [], indent };
      lineW = 0;
    };
    const push = (t: Token): void => {
      const last = line.segments[line.segments.length - 1];
      if (last && JSON.stringify(last.style) === JSON.stringify(t.style)) last.text += t.text;
      else line.segments.push({ text: t.text, style: t.style });
    };

    for (const t of tokens) {
      const w = widthOf(t.text, t.style);
      if (t.space) {
        pending.push(t);
        pendingW += w;
        continue;
      }
      if (line.segments.length > 0 && lineW + pendingW + w > avail) {
        pending = []; // espaços onde a linha quebrou não aparecem
        pendingW = 0;
        flush();
      }
      for (const p of pending) push(p);
      lineW += pendingW + w;
      pending = [];
      pendingW = 0;
      push(t);
    }
    // espaços no fim do parágrafo só valem se não houver mais nada na linha (ex.: parágrafo só de espaços)
    if (line.segments.length === 0) for (const p of pending) push(p);
    raw.push(line);
  }

  const lines: LayoutLine[] = raw.map((rl) => {
    let x = 0;
    const segments: Segment[] = rl.segments.map((s) => {
      const width = widthOf(s.text, s.style);
      const seg = { text: s.text, style: s.style, x, width };
      x += width;
      return seg;
    });
    return { segments, marker: rl.marker, markerX: 0, indent: rl.indent, width: x, y: 0, height: lineH };
  });

  const contentWidth = Math.max(0, ...lines.map((l) => l.indent + l.width));
  const blockWidth = maxWidth === undefined ? contentWidth : maxWidth;
  const factor = align === "center" ? 0.5 : align === "right" ? 1 : 0;

  lines.forEach((l, i) => {
    const offset = Math.max(0, (blockWidth - (l.indent + l.width)) * factor);
    l.markerX = offset;
    l.y = i * lineH;
    for (const s of l.segments) s.x += offset + l.indent;
  });

  return { lines, width: blockWidth, height: lines.length * lineH };
}
