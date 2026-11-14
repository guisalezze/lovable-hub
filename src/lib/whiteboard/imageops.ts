import type { WbElement } from "./types";

export type MediaKind = "image" | "video" | "audio";
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MIN_SIZE = 16;

export function mediaKindOf(mime: string): MediaKind | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}

export function validateFile(f: { name: string; type: string; size: number }): { ok: true; kind: MediaKind } | { ok: false; error: string } {
  const kind = mediaKindOf(f.type);
  if (!kind) return { ok: false, error: `"${f.name}" não é imagem, áudio nem vídeo.` };
  if (f.size <= 0) return { ok: false, error: `"${f.name}" está vazio.` };
  if (f.size > MAX_FILE_BYTES) return { ok: false, error: `"${f.name}" é grande demais (máximo 50 MB).` };
  return { ok: true, kind };
}

type Size = { width: number; height: number };

/** Cabe em maxW×maxH mantendo a proporção; nunca amplia. */
export function fitSize(natural: Size, maxW: number, maxH: number): Size {
  if (!(natural.width > 0) || !(natural.height > 0)) return { width: Math.min(maxW, 320), height: Math.min(maxH, 240) };
  const k = Math.min(1, maxW / natural.width, maxH / natural.height);
  return { width: Math.round(natural.width * k), height: Math.round(natural.height * k) };
}

export function defaultSizeFor(kind: MediaKind, natural: Size | null): Size {
  if (kind === "audio") return { width: 320, height: 64 };
  if (kind === "video" && !natural) return { width: 480, height: 270 };
  return fitSize(natural ?? { width: 480, height: 360 }, 480, 360);
}

type Crop = NonNullable<WbElement["crop"]>;
const fullCrop = (el: WbElement): Crop => el.crop ?? { x: 0, y: 0, width: el.natural?.width ?? el.width, height: el.natural?.height ?? el.height };

export function sourceRect(el: WbElement): { sx: number; sy: number; sw: number; sh: number } {
  const c = fullCrop(el);
  return { sx: c.x, sy: c.y, sw: c.width, sh: c.height };
}

/** Caixa (no mundo) que a imagem inteira ocuparia, na escala atual. */
export function fullBounds(el: WbElement): { x: number; y: number; width: number; height: number } {
  const c = fullCrop(el);
  const nat = el.natural ?? { width: c.width, height: c.height };
  const kx = el.width / c.width;
  const ky = el.height / c.height;
  return { x: el.x - c.x * kx, y: el.y - c.y * ky, width: nat.width * kx, height: nat.height * ky };
}

/**
 * Arrasta uma alça do modo de corte: dx/dy em unidades do mundo, na tela. A escala da imagem não muda.
 * Com a imagem espelhada, a borda da tela é a borda oposta da imagem original (e o arrasto também inverte).
 */
export function cropResize(el: WbElement, handle: string, dx: number, dy: number): WbElement {
  const c = fullCrop(el);
  const nat = el.natural ?? { width: c.width, height: c.height };
  const kx = el.width / c.width;
  const ky = el.height / c.height;
  const swap = (h: string, a: string, b: string) => h.replace(a, "#").replace(b, a).replace("#", b);
  let h = handle;
  let sdx = dx;
  let sdy = dy;
  if (el.flipX) {
    h = swap(h, "w", "e");
    sdx = -dx;
  }
  if (el.flipY) {
    h = swap(h, "n", "s");
    sdy = -dy;
  }
  let left = c.x;
  let top = c.y;
  let right = c.x + c.width;
  let bottom = c.y + c.height;
  const minW = MIN_SIZE / kx;
  const minH = MIN_SIZE / ky;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  if (h.includes("w")) left = clamp(left + sdx / kx, 0, right - minW);
  if (h.includes("e")) right = clamp(right + sdx / kx, left + minW, nat.width);
  if (h.includes("n")) top = clamp(top + sdy / ky, 0, bottom - minH);
  if (h.includes("s")) bottom = clamp(bottom + sdy / ky, top + minH, nat.height);
  const crop = { x: left, y: top, width: right - left, height: bottom - top };
  // a borda esquerda/superior da TELA é a borda direita/inferior da imagem quando espelhada
  const shiftX = el.flipX ? c.x + c.width - right : left - c.x;
  const shiftY = el.flipY ? c.y + c.height - bottom : top - c.y;
  return { ...el, x: el.x + shiftX * kx, y: el.y + shiftY * ky, width: crop.width * kx, height: crop.height * ky, crop };
}

export function resetCrop(el: WbElement): WbElement {
  if (!el.crop) return el;
  const fb = fullBounds(el);
  const c = el.crop;
  const nat = el.natural ?? { width: c.width, height: c.height };
  const kx = el.width / c.width;
  const ky = el.height / c.height;
  // espelhada, a parte cortada à direita/embaixo da imagem original fica à esquerda/em cima na tela
  const x = el.flipX ? el.x - (nat.width - (c.x + c.width)) * kx : fb.x;
  const y = el.flipY ? el.y - (nat.height - (c.y + c.height)) * ky : fb.y;
  const { crop: _crop, ...rest } = el;
  return { ...rest, x, y, width: fb.width, height: fb.height };
}

export function toggleFlip(el: WbElement, axis: "x" | "y"): WbElement {
  return axis === "x" ? { ...el, flipX: !el.flipX } : { ...el, flipY: !el.flipY };
}
