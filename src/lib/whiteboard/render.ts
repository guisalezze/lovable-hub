import rough from "roughjs";
import type { RoughCanvas } from "roughjs/bin/canvas";
import type { Drawable, Options } from "roughjs/bin/core";
import getStroke from "perfect-freehand";
import type { Camera, LaserTrail, WbElement } from "./types";
import { resolveColor, type ThemeColors } from "./theme";
import { getBounds, selectionFrame, type Bounds } from "./geometry";

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

function absPoints(el: WbElement): [number, number][] {
  return (el.points ?? []).map(([px, py]) => [el.x + px, el.y + py]);
}

function buildDrawables(el: WbElement, theme: ThemeColors): Drawable[] {
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
      const out = [generator.linearPath(pts, { ...opts, fill: undefined })];
      if (el.type === "arrow") {
        const head = 10 + el.strokeWidth * 2;
        out.push(generator.linearPath(arrowHead(pts[pts.length - 2], pts[pts.length - 1], head), { ...opts, fill: undefined }));
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
    pts ? pts.length : 0, last,
  ].join("|");
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
    withRotation(ctx, getBounds(el), el.angle, () => {
      if (el.type === "freedraw") {
        const d = freedrawPath(absPoints(el), el.strokeWidth * 3);
        if (d) {
          ctx.fillStyle = resolveColor(el.strokeColor, theme);
          ctx.fill(new Path2D(d));
        }
      } else {
        for (const drawable of drawablesFor(el, theme)) rc!.draw(drawable);
      }
    });
  }

  // seleção e alças
  const selected = elements.filter((e) => selectedIds.has(e.id));
  const frame = selectionFrame(selected, camera.zoom);
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
