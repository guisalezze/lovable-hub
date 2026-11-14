/** Espaçamento entre linhas, em múltiplos do tamanho da fonte. */
export const TEXT_LINE_HEIGHT = 1.25;
export const FONT_FAMILY = '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif';

export function textLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n");
}

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
