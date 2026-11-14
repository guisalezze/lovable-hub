import rough from "roughjs";
import type { WbElement } from "./types";
import { resolveColor, type ThemeColors } from "./theme";
import { rotatedAabb } from "./geometry";
import { absPoints, buildDrawables, freedrawPath } from "./render";
import { FONT_FAMILIES } from "./layout";
import { hasText, textBlockFor } from "./textblock";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface ExportOptions {
  theme: ThemeColors;
  /** Desenha o fundo do tema. Com "auto" o traço usa a cor de texto do tema, então sem fundo pode ficar invisível. */
  background: boolean;
  padding?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Texto do elemento como <text>, um por trecho com o mesmo estilo (marca-texto vira um retângulo atrás). */
function appendSvgText(group: SVGGElement, el: WbElement, theme: ThemeColors) {
  const block = textBlockFor(el);
  const size = el.fontSize ?? 24;
  const family = FONT_FAMILIES[el.fontFamily ?? "sans"];
  const color = resolveColor(el.strokeColor, theme);

  const addText = (text: string, x: number, y: number, style: { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean }) => {
    const t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("x", String(round2(x)));
    t.setAttribute("y", String(round2(y)));
    t.setAttribute("font-size", String(size));
    t.setAttribute("font-family", family);
    t.setAttribute("dominant-baseline", "text-before-edge");
    t.setAttribute("fill", color);
    if (style.bold) t.setAttribute("font-weight", "700");
    if (style.italic) t.setAttribute("font-style", "italic");
    const deco = [style.underline ? "underline" : "", style.strike ? "line-through" : ""].filter(Boolean).join(" ");
    if (deco) t.setAttribute("text-decoration", deco);
    t.setAttribute("xml:space", "preserve");
    t.textContent = text;
    group.appendChild(t);
  };

  for (const line of block.layout.lines) {
    const y = block.y + line.y;
    if (line.marker) addText(line.marker, block.x + line.markerX, y, {});
    for (const seg of line.segments) {
      const x = block.x + seg.x;
      if (seg.style.highlight) {
        const bg = document.createElementNS(SVG_NS, "rect");
        bg.setAttribute("x", String(round2(x)));
        bg.setAttribute("y", String(round2(y)));
        bg.setAttribute("width", String(round2(seg.width)));
        bg.setAttribute("height", String(round2(line.height)));
        bg.setAttribute("fill", seg.style.highlight);
        bg.setAttribute("fill-opacity", "0.6");
        group.appendChild(bg);
      }
      addText(seg.text, x, y, seg.style);
    }
  }
}

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
    } else if (el.type === "text") {
      appendSvgText(group, el, opts.theme);
    } else {
      if (el.type === "note") {
        const paper = document.createElementNS(SVG_NS, "rect");
        paper.setAttribute("x", String(round2(el.x)));
        paper.setAttribute("y", String(round2(el.y)));
        paper.setAttribute("width", String(round2(el.width)));
        paper.setAttribute("height", String(round2(el.height)));
        paper.setAttribute("rx", "6");
        paper.setAttribute("fill", resolveColor(el.backgroundColor, opts.theme));
        group.appendChild(paper);
      } else {
        for (const drawable of buildDrawables(el, opts.theme)) group.appendChild(rc.draw(drawable));
      }
      if (hasText(el)) appendSvgText(group, el, opts.theme);
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
