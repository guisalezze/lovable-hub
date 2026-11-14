import type { LaserPoint, LaserTrail } from "./types";

/** Quanto tempo (ms) cada ponto do rastro leva para sumir. */
export const LASER_LIFETIME_MS = 900;

/** Acrescenta um ponto (coordenadas do mundo) à trilha aberta, ou abre uma trilha nova. */
export function addLaserPoint(trails: LaserTrail[], p: { x: number; y: number }, now: number): LaserTrail[] {
  const point: LaserPoint = { x: p.x, y: p.y, t: now };
  const last = trails[trails.length - 1];
  if (last && last.ended === null) {
    return [...trails.slice(0, -1), { ...last, points: [...last.points, point] }];
  }
  return [...trails, { points: [point], ended: null }];
}

/** Fecha a trilha aberta (o botão do mouse foi solto). */
export function endLaserTrail(trails: LaserTrail[], now: number): LaserTrail[] {
  const last = trails[trails.length - 1];
  if (!last || last.ended !== null) return trails;
  return [...trails.slice(0, -1), { ...last, ended: now }];
}

/** Descarta pontos que já passaram da vida útil e trilhas que ficaram vazias. */
export function pruneLaser(trails: LaserTrail[], now: number): LaserTrail[] {
  return trails
    .map((t) => ({ ...t, points: t.points.filter((p) => now - p.t < LASER_LIFETIME_MS) }))
    .filter((t) => t.points.length > 0);
}

/** 1 no instante do ponto, caindo linearmente até 0. */
export function laserAlpha(point: LaserPoint, now: number): number {
  return Math.min(1, Math.max(0, 1 - (now - point.t) / LASER_LIFETIME_MS));
}
