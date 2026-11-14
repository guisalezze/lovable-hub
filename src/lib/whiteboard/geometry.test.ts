import { describe, it, expect } from "vitest";
import { createElement } from "./scene";
import {
  getBounds,
  getSelectionBounds,
  hitTest,
  elementsInRect,
  getHandleAt,
  resizeBounds,
  scalePoints,
} from "./geometry";

const rect = (extra = {}) => createElement("rectangle", 0, 0, { width: 100, height: 50, ...extra });

describe("getBounds", () => {
  it("usa x,y,width,height para formas", () => {
    expect(getBounds(rect())).toEqual({ x: 0, y: 0, width: 100, height: 50 });
  });

  it("calcula pela lista de pontos em linhas e lápis", () => {
    const el = createElement("freedraw", 10, 10, { points: [[0, 0], [20, -5]] });
    expect(getBounds(el)).toEqual({ x: 10, y: 5, width: 20, height: 5 });
  });

  it("getSelectionBounds une as caixas e devolve null para lista vazia", () => {
    const a = createElement("rectangle", 0, 0, { width: 10, height: 10 });
    const b = createElement("rectangle", 50, 40, { width: 10, height: 10 });
    expect(getSelectionBounds([a, b])).toEqual({ x: 0, y: 0, width: 60, height: 50 });
    expect(getSelectionBounds([])).toBeNull();
  });
});

describe("hitTest", () => {
  it("retângulo vazio só acerta perto da borda", () => {
    expect(hitTest(rect(), { x: 50, y: 25 }, 4)).toBe(false);
    expect(hitTest(rect(), { x: 0, y: 25 }, 4)).toBe(true);
  });

  it("retângulo preenchido acerta por dentro", () => {
    expect(hitTest(rect({ backgroundColor: "#fff" }), { x: 50, y: 25 }, 4)).toBe(true);
    expect(hitTest(rect({ backgroundColor: "#fff" }), { x: 200, y: 25 }, 4)).toBe(false);
  });

  it("elipse não acerta o canto da caixa", () => {
    const el = createElement("ellipse", 0, 0, { width: 100, height: 50, backgroundColor: "#fff" });
    expect(hitTest(el, { x: 50, y: 25 }, 4)).toBe(true);
    expect(hitTest(el, { x: 1, y: 1 }, 4)).toBe(false);
  });

  it("losango não acerta o canto da caixa mas acerta o centro", () => {
    const el = createElement("diamond", 0, 0, { width: 100, height: 50, backgroundColor: "#fff" });
    expect(hitTest(el, { x: 50, y: 25 }, 4)).toBe(true);
    expect(hitTest(el, { x: 2, y: 2 }, 4)).toBe(false);
  });

  it("linha acerta por distância ao segmento", () => {
    const el = createElement("line", 0, 0, { points: [[0, 0], [100, 0]] });
    expect(hitTest(el, { x: 50, y: 3 }, 4)).toBe(true);
    expect(hitTest(el, { x: 50, y: 10 }, 4)).toBe(false);
  });

  it("considera a rotação do elemento", () => {
    const flat = createElement("rectangle", 0, 0, { width: 100, height: 20, backgroundColor: "#fff" });
    const turned = { ...flat, angle: Math.PI / 2 };
    const p = { x: 50, y: -30 }; // 40 acima do centro
    expect(hitTest(flat, p, 2)).toBe(false);
    expect(hitTest(turned, p, 2)).toBe(true);
  });
});

describe("elementsInRect", () => {
  it("devolve só os elementos que a caixa toca", () => {
    const a = createElement("rectangle", 0, 0, { width: 10, height: 10 });
    const b = createElement("rectangle", 100, 100, { width: 10, height: 10 });
    const c = createElement("rectangle", 15, 5, { width: 10, height: 10 });
    const ids = elementsInRect([a, b, c], { x: -5, y: -5, width: 20, height: 20 });
    expect(ids).toEqual([a.id, c.id]);
  });
});

describe("alças", () => {
  const b = { x: 0, y: 0, width: 100, height: 50 };

  it("getHandleAt acha o canto e devolve null longe", () => {
    expect(getHandleAt(b, { x: 100, y: 50 }, 1, true)).toBe("se");
    expect(getHandleAt(b, { x: 0, y: 0 }, 1, true)).toBe("nw");
    expect(getHandleAt(b, { x: 50, y: 25 }, 1, true)).toBeNull();
  });

  it("a alça de girar só existe quando rotatable", () => {
    const p = { x: 50, y: -24 };
    expect(getHandleAt(b, p, 1, true)).toBe("rotate");
    expect(getHandleAt(b, p, 1, false)).toBeNull();
  });

  it("o tamanho da alça acompanha o zoom", () => {
    expect(getHandleAt(b, { x: 104, y: 50 }, 1, true)).toBe("se");
    expect(getHandleAt(b, { x: 104, y: 50 }, 4, true)).toBeNull();
  });
});

describe("resizeBounds", () => {
  const b = { x: 0, y: 0, width: 100, height: 50 };

  it("se aumenta largura e altura", () => {
    expect(resizeBounds(b, "se", 20, 10, false)).toEqual({ x: 0, y: 0, width: 120, height: 60 });
  });

  it("nw move a origem", () => {
    expect(resizeBounds(b, "nw", 10, 5, false)).toEqual({ x: 10, y: 5, width: 90, height: 45 });
  });

  it("arrastar além do lado oposto inverte e normaliza", () => {
    expect(resizeBounds(b, "se", -200, 0, false)).toEqual({ x: -100, y: 0, width: 100, height: 50 });
  });

  it("keepRatio preserva a proporção", () => {
    const r = resizeBounds(b, "se", 100, 10, true);
    expect(r.width / r.height).toBeCloseTo(2);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });

  it("alças de lado só mudam um eixo", () => {
    expect(resizeBounds(b, "e", 30, 99, false)).toEqual({ x: 0, y: 0, width: 130, height: 50 });
  });
});

describe("scalePoints", () => {
  it("leva pontos de uma caixa para a outra", () => {
    const out = scalePoints(
      [[0, 0], [100, 50]],
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 10, y: 10, width: 200, height: 100 },
    );
    expect(out).toEqual([[10, 10], [210, 110]]);
  });

  it("caixa de origem sem largura não gera NaN", () => {
    const out = scalePoints([[5, 0], [5, 40]], { x: 5, y: 0, width: 0, height: 40 }, { x: 5, y: 0, width: 30, height: 40 });
    expect(out.flat().every(Number.isFinite)).toBe(true);
  });
});
