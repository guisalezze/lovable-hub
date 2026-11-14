import { describe, it, expect } from "vitest";
import { MIN_ZOOM, MAX_ZOOM, screenToWorld, worldToScreen, panBy, zoomAt } from "./camera";

describe("camera", () => {
  it("screenToWorld desfaz worldToScreen com zoom 2", () => {
    const cam = { x: 30, y: -10, zoom: 2 };
    const p = { x: 123, y: 45 };
    const back = screenToWorld(cam, worldToScreen(cam, p));
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });

  it("zoomAt mantém o ponto sob o mouse parado", () => {
    const cam = { x: 10, y: 20, zoom: 1 };
    const pt = { x: 300, y: 200 };
    const before = screenToWorld(cam, pt);
    const next = zoomAt(cam, pt, 2);
    const after = screenToWorld(next, pt);
    expect(next.zoom).toBe(2);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("zoomAt respeita os limites de zoom", () => {
    const cam = { x: 0, y: 0, zoom: 1 };
    expect(zoomAt(cam, { x: 0, y: 0 }, 1000).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(cam, { x: 0, y: 0 }, 0.00001).zoom).toBe(MIN_ZOOM);
  });

  it("panBy com zoom 2 move a câmera pela metade", () => {
    const next = panBy({ x: 0, y: 0, zoom: 2 }, 100, 40);
    expect(next.x).toBe(-50);
    expect(next.y).toBe(-20);
  });

  it("não altera a câmera original", () => {
    const cam = { x: 0, y: 0, zoom: 1 };
    panBy(cam, 10, 10);
    zoomAt(cam, { x: 5, y: 5 }, 2);
    expect(cam).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});
