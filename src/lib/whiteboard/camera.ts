import type { Camera } from "./types";

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;

interface Pt {
  x: number;
  y: number;
}

export function screenToWorld(cam: Camera, p: Pt): Pt {
  return { x: cam.x + p.x / cam.zoom, y: cam.y + p.y / cam.zoom };
}

export function worldToScreen(cam: Camera, p: Pt): Pt {
  return { x: (p.x - cam.x) * cam.zoom, y: (p.y - cam.y) * cam.zoom };
}

/** Desloca a câmera arrastando dxScreen/dyScreen pixels de tela. */
export function panBy(cam: Camera, dxScreen: number, dyScreen: number): Camera {
  return { x: cam.x - dxScreen / cam.zoom, y: cam.y - dyScreen / cam.zoom, zoom: cam.zoom };
}

/** Zoom mantendo o ponto de tela (o cursor) parado sobre o mesmo ponto do mundo. */
export function zoomAt(cam: Camera, screenPoint: Pt, factor: number): Camera {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.zoom * factor));
  const world = screenToWorld(cam, screenPoint);
  return { x: world.x - screenPoint.x / zoom, y: world.y - screenPoint.y / zoom, zoom };
}
