import rough from "roughjs";
import type { WbElement } from "./types";
import { resolveColor, type ThemeColors } from "./theme";
import { rotatedAabb } from "./geometry";
import { absPoints, buildDrawables, freedrawPath } from "./render";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface ExportOptions {
  theme: ThemeColors;
  /** Desenha o fundo do tema. Com "auto" o traço usa a cor de texto do tema, então sem fundo pode ficar invisível. */
  background: boolean;
  padding?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** SVG completo dos elementos, enquadrado na caixa do conteúdo mais o preenchimento. */
export function exportToSvg(elements: WbElement[], opts: ExportOptions): string {
  if (elements.length === 0) throw new Error("Nada para exportar");
  const pad = opts.padding ?? 16;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    const b = rotatedAabb(el);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  const x = round2(minX - pad);
  const y = round2(minY - pad);
  const w = Math.max(round2(maxX - minX + pad * 2), 1);
  const h = Math.max(round2(maxY - minY + pad * 2), 1);

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
  svg.setAttribute("width", String(w));
  svg.setAttribute("height", String(h));

  if (opts.background) {
    const bg = document.createElementNS(SVG_NS, "rect");
    bg.setAttribute("x", String(x));
    bg.setAttribute("y", String(y));
    bg.setAttribute("width", String(w));
    bg.setAttribute("height", String(h));
    bg.setAttribute("fill", opts.theme.background);
    svg.appendChild(bg);
  }

  const rc = rough.svg(svg);
  for (const el of elements) {
    const group = document.createElementNS(SVG_NS, "g");
    if (el.angle) {
      const b = rotatedAabb({ ...el, angle: 0 });
      const deg = round2((el.angle * 180) / Math.PI);
      group.setAttribute("transform", `rotate(${deg} ${round2(b.x + b.width / 2)} ${round2(b.y + b.height / 2)})`);
    }
    if (el.type === "freedraw") {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", freedrawPath(absPoints(el), el.strokeWidth * 3));
      path.setAttribute("fill", resolveColor(el.strokeColor, opts.theme));
      group.appendChild(path);
    } else {
      for (const drawable of buildDrawables(el, opts.theme)) group.appendChild(rc.draw(drawable));
    }
    svg.appendChild(group);
  }

  return new XMLSerializer().serializeToString(svg);
}

/** PNG a partir do SVG (escala 2 = nítido em telas de alta densidade). */
export async function exportToPng(elements: WbElement[], opts: ExportOptions & { scale?: number }): Promise<Blob> {
  const svgText = exportToSvg(elements, opts);
  const scale = opts.scale ?? 2;
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml").documentElement;
  const width = Math.round(Number(doc.getAttribute("width")) * scale);
  const height = Math.round(Number(doc.getAttribute("height")) * scale);

  const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.width = width;
    img.height = height;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Não consegui gerar a imagem"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não consegui gerar a imagem");
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Não consegui gerar a imagem"))), "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Copia o PNG para a área de transferência. Devolve false se o navegador não permitir. */
export async function copyPngToClipboard(blob: Blob): Promise<boolean> {
  try {
    if (!navigator.clipboard || typeof ClipboardItem === "undefined") return false;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}

/** Nome de arquivo seguro a partir do título do quadro. */
export function exportFileName(title: string, ext: "png" | "svg"): string {
  const clean = title.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
  return `${clean || "quadro"}.${ext}`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
