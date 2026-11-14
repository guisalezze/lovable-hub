/** Espaçamento entre linhas, em múltiplos do tamanho da fonte. */
export const TEXT_LINE_HEIGHT = 1.25;
export const FONT_FAMILY = '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif';

export function textLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n");
}

// mesmas famílias de layout.ts (duplicadas aqui para text.ts não depender de layout.ts)
const FAMILIES = {
  sans: FONT_FAMILY,
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"Cascadia Code", Consolas, "Courier New", monospace',
  hand: '"Segoe Print", "Comic Sans MS", "Bradley Hand", cursive',
};

let measureCtx: CanvasRenderingContext2D | null | undefined;

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (measureCtx !== undefined) return measureCtx;
  measureCtx = null;
  try {
    // jsdom (testes) não tem canvas de verdade: usa a estimativa abaixo
    if (typeof document !== "undefined" && !/jsdom/i.test(navigator.userAgent)) {
      measureCtx = document.createElement("canvas").getContext("2d");
    }
  } catch {
    measureCtx = null;
  }
  return measureCtx;
}

/** Largura de um texto numa fonte (px). Usa o canvas do navegador; nos testes (sem canvas), uma estimativa. */
export function canvasMeasure(text: string, font: { size: number; bold: boolean; italic: boolean; family: string }): number {
  const ctx = getMeasureContext();
  if (ctx) {
    ctx.font = `${font.italic ? "italic " : ""}${font.bold ? "700 " : ""}${font.size}px ${(FAMILIES as Record<string, string>)[font.family] ?? FONT_FAMILY}`;
    return ctx.measureText(text).width;
  }
  return text.length * font.size * 0.55 * (font.bold ? 1.08 : 1);
}

/** Tamanho (unidades do mundo) que o texto ocupa. A largura é a da linha mais comprida. */
export function measureText(text: string, fontSize: number): { width: number; height: number } {
  const size = Math.max(1, Number.isFinite(fontSize) ? fontSize : 1);
  const lines = textLines(text);
  const ctx = getMeasureContext();
  let width: number;
  if (ctx) {
    ctx.font = `${size}px ${FONT_FAMILY}`;
    width = Math.max(...lines.map((line) => ctx.measureText(line).width));
  } else {
    width = Math.max(...lines.map((line) => line.length)) * size * 0.55;
  }
  return { width: Math.max(width, size * 0.5), height: lines.length * size * TEXT_LINE_HEIGHT };
}
