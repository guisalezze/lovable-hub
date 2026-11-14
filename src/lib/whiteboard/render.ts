import rough from "roughjs";
import type { RoughCanvas } from "roughjs/bin/canvas";
import type { Drawable, Options } from "roughjs/bin/core";
import getStroke from "perfect-freehand";
import type { Camera, LaserTrail, WbElement } from "./types";
import { resolveColor, type ThemeColors } from "./theme";
import { bendHandlePoint, endpointHandles, getBounds, rotatedAabb, selectionFrame, type Bounds } from "./geometry";
import type { Guide } from "./snap";
import { laserAlpha } from "./laser";
import { FONT_FAMILY, TEXT_LINE_HEIGHT, textLines } from "./text";

const GRID_STEP = 24; // unidades do mundo
const generator = rough.generator();

/** Caminho SVG do contorno de um traço de lápis (perfect-freehand). */
export function freedrawPath(points: [number, number][], size: number): string {
  if (points.length === 0) return "";
  // last: true = traço completo; sem isso o suavizador deixa a ponta "atrasada" em relação ao mouse
  const outline = getStroke(points, { size, thinning: 0.5, smoothing: 0.5, streamline: 0.5, last: true });
  if (outline.length === 0) return "";
  const f = (n: number) => n.toFixed(2);
  let d = `M ${f(outline[0][0])} ${f(outline[0][1])} Q`;
  for (let i = 0; i < outline.length; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % outline.length];
    d += ` ${f(x0)} ${f(y0)} ${f((x0 + x1) / 2)} ${f((y0 + y1) / 2)}`;
  }
  return `${d} Z`;
}

function roundedRectPath(x: number, y: number, w: number, h: number): string {
  const r = Math.max(0, Math.min(16, Math.min(w, h) / 4));
  return [
    `M ${x + r} ${y}`,
    `L ${x + w - r} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + r}`,
    `L ${x + w} ${y + h - r}`,
    `Q ${x + w} ${y + h} ${x + w - r} ${y + h}`,
    `L ${x + r} ${y + h}`,
    `Q ${x} ${y + h} ${x} ${y + h - r}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    "Z",
  ].join(" ");
}

function arrowHead(from: [number, number], tip: [number, number], size: number): [number, number][] {
  const angle = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
  const spread = Math.PI / 7;
  return [
    [tip[0] - size * Math.cos(angle - spread), tip[1] - size * Math.sin(angle - spread)],
    tip,
    [tip[0] - size * Math.cos(angle + spread), tip[1] - size * Math.sin(angle + spread)],
  ];
}

export function absPoints(el: WbElement): [number, number][] {
  return (el.points ?? []).map(([px, py]) => [el.x + px, el.y + py]);
}

export function buildDrawables(el: WbElement, theme: ThemeColors): Drawable[] {
  const stroke = resolveColor(el.strokeColor, theme);
  const filled = el.backgroundColor !== "transparent";
  const opts: Options = {
    seed: el.seed,
    stroke,
    strokeWidth: el.strokeWidth,
    roughness: 1,
    ...(filled ? { fill: resolveColor(el.backgroundColor, theme), fillStyle: "solid" } : {}),
  };
  switch (el.type) {
    case "rectangle":
      return [
        el.roundness === "round"
          ? generator.path(roundedRectPath(el.x, el.y, el.width, el.height), opts)
          : generator.rectangle(el.x, el.y, el.width, el.height, opts),
      ];
    case "diamond": {
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      return [
        generator.polygon(
          [
            [cx, el.y],
            [el.x + el.width, cy],
            [cx, el.y + el.height],
            [el.x, cy],
          ],
          opts,
        ),
      ];
    }
    case "ellipse":
      return [generator.ellipse(el.x + el.width / 2, el.y + el.height / 2, el.width, el.height, opts)];
    case "line":
    case "arrow": {
      const pts = absPoints(el);
      if (pts.length < 2) return [];
      const curved = el.bend && pts.length === 2 ? ([el.x + el.bend[0], el.y + el.bend[1]] as [number, number]) : null;
      const out = [
        curved
          ? generator.path(`M ${pts[0][0]} ${pts[0][1]} Q ${curved[0]} ${curved[1]} ${pts[1][0]} ${pts[1][1]}`, { ...opts, fill: undefined })
          : generator.linearPath(pts, { ...opts, fill: undefined }),
      ];
      if (el.type === "arrow") {
        const head = 10 + el.strokeWidth * 2;
        // numa curva a ponta segue a tangente do fim (do ponto de controle até a ponta)
        const from = curved ?? pts[pts.length - 2];
        out.push(generator.linearPath(arrowHead(from, pts[pts.length - 1], head), { ...opts, fill: undefined }));
      }
      return out;
    }
    default:
      return [];
  }
}

function signature(el: WbElement, theme: ThemeColors): string {
  const pts = el.points;
  const last = pts && pts.length ? pts[pts.length - 1].join(",") : "";
  return [
    el.type, el.x, el.y, el.width, el.height, el.seed, el.strokeWidth, el.roundness,
    resolveColor(el.strokeColor, theme), resolveColor(el.backgroundColor, theme),
    pts ? pts.length : 0, last, el.bend ? el.bend.join(",") : "",
  ].join("|");
}

/** Desenhar fora da tela é trabalho jogado fora: pula o que está longe (com folga para a espessura do traço). */
export function isElementVisible(el: WbElement, camera: Camera, width: number, height: number): boolean {
  const b = rotatedAabb(el);
  const margin = el.strokeWidth * 3 + 8;
  const right = camera.x + width / camera.zoom;
  const bottom = camera.y + height / camera.zoom;
  return b.x + b.width + margin >= camera.x && b.x - margin <= right && b.y + b.height + margin >= camera.y && b.y - margin <= bottom;
}

// O contorno do lápis (perfect-freehand) é caro. Fica guardado por lista de pontos (em coordenadas do elemento,
// então mover o elemento não recalcula nada): só o traço que está sendo desenhado muda a cada quadro.
const NO_POINTS: [number, number][] = [];
const freedrawCache = new WeakMap<object, { size: number; path: Path2D | null }>();

function freedrawPath2D(el: WbElement): Path2D | null {
  const points = el.points ?? NO_POINTS;
  const size = el.strokeWidth * 3;
  const hit = freedrawCache.get(points);
  if (hit && hit.size === size) return hit.path;
  const d = freedrawPath(points, size);
  const path = d ? new Path2D(d) : null;
  freedrawCache.set(points, { size, path });
  return path;
}

const drawableCache = new WeakMap<WbElement, { sig: string; drawables: Drawable[] }>();
const roughCanvases = new WeakMap<HTMLCanvasElement, RoughCanvas>();

function drawablesFor(el: WbElement, theme: ThemeColors): Drawable[] {
  const sig = signature(el, theme);
  const hit = drawableCache.get(el);
  if (hit && hit.sig === sig) return hit.drawables;
  const drawables = buildDrawables(el, theme);
  drawableCache.set(el, { sig, drawables });
  return drawables;
}

function drawGrid(ctx: CanvasRenderingContext2D, camera: Camera, width: number, height: number, color: string) {
  if (camera.zoom < 0.4) return; // pontos muito juntos viram ruído
  const x0 = Math.floor(camera.x / GRID_STEP) * GRID_STEP;
  const y0 = Math.floor(camera.y / GRID_STEP) * GRID_STEP;
  const x1 = camera.x + width / camera.zoom;
  const y1 = camera.y + height / camera.zoom;
  const dot = 1.5 / camera.zoom;
  ctx.fillStyle = color;
  for (let x = x0; x <= x1; x += GRID_STEP) {
    for (let y = y0; y <= y1; y += GRID_STEP) ctx.fillRect(x - dot / 2, y - dot / 2, dot, dot);
  }
}

function withRotation(ctx: CanvasRenderingContext2D, b: Bounds, angle: number, draw: () => void) {
  ctx.save();
  if (angle) {
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.translate(-cx, -cy);
  }
  draw();
  ctx.restore();
}

export interface DrawArgs {
  elements: WbElement[];
  camera: Camera;
  theme: ThemeColors;
  selectedIds: Set<string>;
  showGrid: boolean;
  width: number; // px CSS
  height: number;
  dpr: number;
  marquee?: Bounds | null;
  trails?: LaserTrail[];
  /** Instante (ms, performance.now) usado para o brilho do laser; padrão: agora. */
  now?: number;
  /** false = não desenha a moldura de seleção nem as alças (modo apresentação). Padrão: true. */
  showSelection?: boolean;
  /** Elemento que não deve ser desenhado (o texto que está sendo editado: o campo de texto o mostra). */
  hiddenId?: string | null;
  /** Linhas-guia do alinhamento automático (aparecem enquanto se arrasta). */
  guides?: Guide[];
  /** Forma que vai receber a ponta de uma seta (destaque). */
  highlightId?: string | null;
}

function drawText(ctx: CanvasRenderingContext2D, el: WbElement, theme: ThemeColors) {
  const size = el.fontSize ?? 24;
  ctx.font = `${size}px ${FONT_FAMILY}`;
  ctx.textBaseline = "top";
  ctx.fillStyle = resolveColor(el.strokeColor, theme);
  textLines(el.text ?? "").forEach((line, i) => ctx.fillText(line, el.x, el.y + i * size * TEXT_LINE_HEIGHT));
}

function drawLaser(ctx: CanvasRenderingContext2D, trails: LaserTrail[], zoom: number, now: number) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "#ff2d2d";
  ctx.shadowBlur = 12;
  for (const trail of trails) {
    const pts = trail.points;
    for (let i = 1; i < pts.length; i++) {
      const alpha = laserAlpha(pts[i], now);
      if (alpha <= 0) continue;
      ctx.strokeStyle = `rgba(255, 45, 45, ${alpha})`;
      ctx.lineWidth = (2 + 5 * alpha) / zoom;
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
    if (trail.ended === null && pts.length > 0) {
      const head = pts[pts.length - 1];
      ctx.fillStyle = "#ff2d2d";
      ctx.beginPath();
      ctx.arc(head.x, head.y, 5 / zoom, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawScene(ctx: CanvasRenderingContext2D, args: DrawArgs): void {
  const { elements, camera, theme, selectedIds, showGrid, width, height, dpr, marquee } = args;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width * dpr, height * dpr);
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width * dpr, height * dpr);

  const k = dpr * camera.zoom;
  ctx.setTransform(k, 0, 0, k, -camera.x * k, -camera.y * k);

  if (showGrid) drawGrid(ctx, camera, width, height, theme.grid);

  let rc = roughCanvases.get(ctx.canvas);
  if (!rc) {
    rc = rough.canvas(ctx.canvas);
    roughCanvases.set(ctx.canvas, rc);
  }

  for (const el of elements) {
    if (el.id === args.hiddenId) continue;
    if (!isElementVisible(el, camera, width, height)) continue;
    withRotation(ctx, getBounds(el), el.angle, () => {
      if (el.type === "freedraw") {
        const path = freedrawPath2D(el);
        if (path) {
          ctx.fillStyle = resolveColor(el.strokeColor, theme);
          ctx.save();
          ctx.translate(el.x, el.y);
          ctx.fill(path);
          ctx.restore();
        }
      } else if (el.type === "text") {
        drawText(ctx, el, theme);
      } else {
        for (const drawable of drawablesFor(el, theme)) rc!.draw(drawable);
      }
    });
  }

  // destaque da forma que vai receber a ponta da seta
  if (args.highlightId) {
    const target = elements.find((e) => e.id === args.highlightId);
    if (target) {
      const b = getBounds(target);
      const pad = 5 / camera.zoom;
      withRotation(ctx, b, target.angle, () => {
        ctx.save();
        ctx.strokeStyle = theme.selection;
        ctx.lineWidth = 2.5 / camera.zoom;
        ctx.strokeRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
        ctx.restore();
      });
    }
  }

  // seleção e alças
  const selected = elements.filter((e) => selectedIds.has(e.id));
  const frame = args.showSelection === false ? null : selectionFrame(selected, camera.zoom);
  if (frame) {
    const b = frame.bounds;
    withRotation(ctx, b, frame.angle, () => {
      ctx.strokeStyle = theme.selection;
      ctx.lineWidth = 1.5 / camera.zoom;
      ctx.setLineDash([]);
      ctx.strokeRect(b.x, b.y, b.width, b.height);
      const s = 8 / camera.zoom;
      for (const [id, pos] of frame.handles) {
        ctx.fillStyle = theme.background;
        ctx.beginPath();
        if (id === "rotate") ctx.arc(pos.x, pos.y, s / 2, 0, Math.PI * 2);
        else ctx.rect(pos.x - s / 2, pos.y - s / 2, s, s);
        ctx.fill();
        ctx.stroke();
      }
    });
  }

  if (args.showSelection !== false && selected.length === 1 && !selected[0].locked) {
    // alças das pontas da seta/linha: cheia quando a ponta está presa a uma forma
    const eh = endpointHandles(selected[0]);
    if (eh) {
      ctx.save();
      ctx.strokeStyle = theme.selection;
      ctx.lineWidth = 1.5 / camera.zoom;
      for (const [pt, bound] of [[eh.start, !!selected[0].bindings?.start], [eh.end, !!selected[0].bindings?.end]] as const) {
        ctx.fillStyle = bound ? theme.selection : theme.background;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 5 / camera.zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
    const hp = bendHandlePoint(selected[0]); // bolinha de curvar
    if (hp) {
      ctx.save();
      ctx.fillStyle = theme.selection;
      ctx.strokeStyle = theme.background;
      ctx.lineWidth = 1.5 / camera.zoom;
      ctx.beginPath();
      ctx.arc(hp.x, hp.y, 5.5 / camera.zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  if (args.guides && args.guides.length > 0) {
    ctx.save();
    ctx.strokeStyle = theme.selection;
    ctx.lineWidth = 1 / camera.zoom;
    ctx.setLineDash([5 / camera.zoom, 4 / camera.zoom]);
    for (const g of args.guides) {
      ctx.beginPath();
      if (g.axis === "x") {
        ctx.moveTo(g.pos, g.from);
        ctx.lineTo(g.pos, g.to);
      } else {
        ctx.moveTo(g.from, g.pos);
        ctx.lineTo(g.to, g.pos);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  if (args.trails && args.trails.length > 0) drawLaser(ctx, args.trails, camera.zoom, args.now ?? performance.now());

  if (marquee) {
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = theme.selection;
    ctx.fillRect(marquee.x, marquee.y, marquee.width, marquee.height);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = theme.selection;
    ctx.lineWidth = 1 / camera.zoom;
    ctx.strokeRect(marquee.x, marquee.y, marquee.width, marquee.height);
    ctx.restore();
  }
}
