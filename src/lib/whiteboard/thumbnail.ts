import type { WbElement } from "./types";
import type { ThemeColors } from "./theme";
import { exportToSvg, svgSize, svgToCanvas } from "./export";

/** A miniatura é refeita no máximo a cada tanto tempo (gerar a imagem a cada autosave pesaria sem necessidade). */
export const THUMB_INTERVAL_MS = 20_000;
export const THUMB_MAX_WIDTH = 320;
export const THUMB_MAX_HEIGHT = 200;

export function shouldRegenerateThumbnail(lastAt: number, now: number, force = false): boolean {
  return force || lastAt === 0 || now - lastAt >= THUMB_INTERVAL_MS;
}

/** Miniatura JPEG (data URL) dos elementos, com o fundo do tema. Sem elementos: null (limpa a miniatura). */
export async function renderThumbnail(elements: WbElement[], theme: ThemeColors): Promise<string | null> {
  if (elements.length === 0) return null;
  const svg = exportToSvg(elements, { theme, background: true, padding: 24 });
  const { width, height } = svgSize(svg);
  const scale = Math.min(1, THUMB_MAX_WIDTH / width, THUMB_MAX_HEIGHT / height);
  const canvas = await svgToCanvas(svg, Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
  return canvas.toDataURL("image/jpeg", 0.7);
}
