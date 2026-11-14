import { describe, it, expect } from "vitest";
import { isElementVisible } from "./render";
import { createElement } from "./scene";

const cam = { x: 0, y: 0, zoom: 1 };
const W = 800;
const H = 600;
const box = (x: number, y: number, w = 50, h = 50, extra = {}) => createElement("rectangle", x, y, { width: w, height: h, ...extra });

describe("isElementVisible", () => {
  it("dentro da tela: sim", () => {
    expect(isElementVisible(box(100, 100), cam, W, H)).toBe(true);
  });

  it("muito longe da tela: não", () => {
    expect(isElementVisible(box(5000, 5000), cam, W, H)).toBe(false);
    expect(isElementVisible(box(-5000, 100), cam, W, H)).toBe(false);
  });

  it("cortado pela borda: sim", () => {
    expect(isElementVisible(box(790, 10), cam, W, H)).toBe(true);
    expect(isElementVisible(box(-30, 10), cam, W, H)).toBe(true);
  });

  it("acompanha a câmera e o zoom", () => {
    expect(isElementVisible(box(100, 100), { x: 1000, y: 0, zoom: 1 }, W, H)).toBe(false);
    expect(isElementVisible(box(1500, 100), { x: 0, y: 0, zoom: 0.5 }, W, H)).toBe(true); // tela mostra 1600×1200 do mundo
    expect(isElementVisible(box(1500, 100), cam, W, H)).toBe(false);
  });

  it("a espessura do traço conta: logo fora da borda, mas o traço entra", () => {
    const stroke = createElement("freedraw", -12, 100, { points: [[0, 0], [10, 0]], strokeWidth: 7 });
    expect(isElementVisible(stroke, cam, W, H)).toBe(true);
  });

  it("considera a rotação (a caixa girada é o que vale)", () => {
    const flat = box(700, 300, 200, 10); // ocupa x 700..900: aparece
    const turned = { ...box(900, 300, 200, 10), angle: Math.PI / 2 }; // centro em x=1000 e gira para x≈995..1005: fora
    expect(isElementVisible(flat, cam, W, H)).toBe(true);
    expect(isElementVisible(turned, cam, W, H)).toBe(false);
  });

  it("elemento sem tamanho (ponto do lápis) no meio da tela ainda é visível", () => {
    const dot = createElement("freedraw", 400, 300, { points: [[0, 0]] });
    expect(isElementVisible(dot, cam, W, H)).toBe(true);
  });
});
