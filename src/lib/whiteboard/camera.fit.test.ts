import { describe, it, expect } from "vitest";
import { fitCamera, worldToScreen } from "./camera";

const viewport = { width: 1000, height: 500 };

describe("fitCamera", () => {
  it("conteúdo grande: reduz o zoom para caber e centraliza", () => {
    const bounds = { x: 0, y: 0, width: 2000, height: 1000 };
    const cam = fitCamera(bounds, viewport, 50);
    expect(cam.zoom).toBeCloseTo(0.4); // min(900/2000, 400/1000)
    const center = worldToScreen(cam, { x: 1000, y: 500 });
    expect(center.x).toBeCloseTo(500);
    expect(center.y).toBeCloseTo(250);
  });

  it("conteúdo pequeno: não amplia além de 100% e centraliza", () => {
    const bounds = { x: 100, y: 100, width: 40, height: 20 };
    const cam = fitCamera(bounds, viewport, 50);
    expect(cam.zoom).toBe(1);
    const center = worldToScreen(cam, { x: 120, y: 110 });
    expect(center.x).toBeCloseTo(500);
    expect(center.y).toBeCloseTo(250);
  });

  it("sem conteúdo devolve a câmera padrão", () => {
    expect(fitCamera(null, viewport)).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it("conteúdo com largura ou altura zero não gera NaN", () => {
    const cam = fitCamera({ x: 5, y: 5, width: 0, height: 0 }, viewport);
    expect(Number.isFinite(cam.x) && Number.isFinite(cam.y) && Number.isFinite(cam.zoom)).toBe(true);
  });

  it("janela menor que o preenchimento não gera zoom negativo", () => {
    const cam = fitCamera({ x: 0, y: 0, width: 100, height: 100 }, { width: 20, height: 20 }, 50);
    expect(cam.zoom).toBeGreaterThan(0);
  });
});
