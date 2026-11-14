import type { Bounds } from "./geometry";

/** Linha-guia mostrada enquanto o alinhamento automático está agindo. */
export interface Guide {
  axis: "x" | "y"; // x = linha vertical (posição em x); y = linha horizontal
  pos: number;
  from: number;
  to: number;
}

const targets = (b: Bounds, axis: "x" | "y") =>
  axis === "x" ? [b.x, b.x + b.width / 2, b.x + b.width] : [b.y, b.y + b.height / 2, b.y + b.height];

/** Menor correção (em módulo) que leva uma borda/centro de `moving` a uma de `others`, dentro do limite. */
function bestDelta(moving: Bounds, others: Bounds[], threshold: number, axis: "x" | "y"): number | null {
  let delta: number | null = null;
  let bestAbs = Infinity;
  const mine = targets(moving, axis);
  for (const o of others) {
    for (const t of targets(o, axis)) {
      for (const m of mine) {
        const d = t - m;
        if (Math.abs(d) <= threshold && Math.abs(d) < bestAbs) {
          bestAbs = Math.abs(d);
          delta = d;
        }
      }
    }
  }
  return delta;
}

/**
 * Alinhamento automático ao mover: encaixa bordas e centros de `moving` nos dos `others`, se estiverem a
 * `threshold` ou menos. Devolve o ajuste (dx, dy) e as guias para desenhar.
 */
export function computeSnap(moving: Bounds, others: Bounds[], threshold: number): { dx: number; dy: number; guides: Guide[] } {
  if (threshold <= 0 || others.length === 0) return { dx: 0, dy: 0, guides: [] };

  const sx = bestDelta(moving, others, threshold, "x");
  const sy = bestDelta(moving, others, threshold, "y");
  const dx = sx ?? 0;
  const dy = sy ?? 0;
  const snapped: Bounds = { ...moving, x: moving.x + dx, y: moving.y + dy };
  const guides: Guide[] = [];

  for (const axis of ["x", "y"] as const) {
    if ((axis === "x" ? sx : sy) === null) continue;
    const mine = targets(snapped, axis);
    for (const o of others) {
      for (const t of targets(o, axis)) {
        if (!mine.some((m) => Math.abs(m - t) < 1e-6)) continue;
        const [fromA, toA] = axis === "x" ? [snapped.y, snapped.y + snapped.height] : [snapped.x, snapped.x + snapped.width];
        const [fromB, toB] = axis === "x" ? [o.y, o.y + o.height] : [o.x, o.x + o.width];
        guides.push({ axis, pos: t, from: Math.min(fromA, fromB), to: Math.max(toA, toB) });
      }
    }
  }
  return { dx, dy, guides };
}
