import { describe, it, expect } from "vitest";
import { createElement, parseScene, serializeScene } from "./scene";
import { bendFromHandle, bendHandlePoint, curvePoints, getBounds, hitTest } from "./geometry";

const arrow = (bend?: [number, number], extra = {}) =>
  createElement("arrow", 0, 0, { points: [[0, 0], [100, 0]], ...(bend ? { bend } : {}), ...extra });

const near = (p: { x: number; y: number }, x: number, y: number, tol = 0.6) => Math.hypot(p.x - x, p.y - y) <= tol;

describe("curvePoints", () => {
  it("reta: só as duas pontas", () => {
    expect(curvePoints(arrow())).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
  });

  it("curva: começa e termina nas pontas e passa pelo meio da curva", () => {
    const pts = curvePoints(arrow([50, -50]));
    expect(pts.length).toBeGreaterThan(8);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 100, y: 0 });
    // ponto de controle em (50,-50) => o meio da curva fica a meio caminho: (50,-25)
    expect(pts.some((p) => near(p, 50, -25))).toBe(true);
  });
});

describe("caixa e acerto de uma seta curva", () => {
  it("a caixa inclui o alto da curva, não o ponto de controle", () => {
    const b = getBounds(arrow([50, -50]));
    expect(b.x).toBeCloseTo(0);
    expect(b.width).toBeCloseTo(100);
    expect(b.y).toBeCloseTo(-25, 0);
    expect(b.height).toBeCloseTo(25, 0);
  });

  it("clicar na curva acerta; clicar na reta imaginária (a corda) não", () => {
    const el = arrow([50, -50]);
    expect(hitTest(el, { x: 50, y: -25 }, 4)).toBe(true);
    expect(hitTest(el, { x: 50, y: 0 }, 4)).toBe(false);
    expect(hitTest(el, { x: 0, y: 0 }, 4)).toBe(true);
    expect(hitTest(el, { x: 100, y: 0 }, 4)).toBe(true);
  });

  it("a seta reta continua igual", () => {
    expect(hitTest(arrow(), { x: 50, y: 3 }, 4)).toBe(true);
    expect(hitTest(arrow(), { x: 50, y: 20 }, 4)).toBe(false);
  });
});

describe("bendHandlePoint", () => {
  it("reta: bolinha no meio da seta", () => {
    expect(bendHandlePoint(arrow())).toEqual({ x: 50, y: 0 });
  });

  it("curva: bolinha no meio da curva", () => {
    const p = bendHandlePoint(arrow([50, -50]));
    expect(near(p!, 50, -25)).toBe(true);
  });

  it("vale para linha também", () => {
    const line = createElement("line", 0, 0, { points: [[0, 0], [100, 0]] });
    expect(bendHandlePoint(line)).toEqual({ x: 50, y: 0 });
  });

  it("não existe em formas, lápis, caminhos com mais de 2 pontos nem elementos girados", () => {
    expect(bendHandlePoint(createElement("rectangle", 0, 0, { width: 10, height: 10 }))).toBeNull();
    expect(bendHandlePoint(createElement("freedraw", 0, 0, { points: [[0, 0], [5, 5]] }))).toBeNull();
    expect(bendHandlePoint(createElement("line", 0, 0, { points: [[0, 0], [5, 5], [9, 0]] }))).toBeNull();
    expect(bendHandlePoint(arrow(undefined, { angle: 0.5 }))).toBeNull();
  });
});

describe("bendFromHandle", () => {
  it("a curva passa pelo ponto onde a bolinha foi solta", () => {
    const el = arrow();
    const bend = bendFromHandle(el, { x: 50, y: -40 }, 4)!;
    expect(bend).toEqual([50, -80]);
    const pts = curvePoints({ ...el, bend });
    expect(pts.some((p) => near(p, 50, -40))).toBe(true);
  });

  it("perto da reta (dentro da folga) endireita a seta", () => {
    expect(bendFromHandle(arrow([50, -50]), { x: 50, y: 2 }, 4)).toBeUndefined();
  });

  it("considera a posição da seta no quadro", () => {
    const el = createElement("arrow", 200, 100, { points: [[0, 0], [100, 0]] });
    const bend = bendFromHandle(el, { x: 250, y: 60 }, 4)!;
    expect(bend).toEqual([50, -80]); // relativo a (x, y) do elemento, como os pontos
  });
});

describe("cena com seta curva", () => {
  it("serializa e lê de volta", () => {
    const els = [arrow([50, -80])];
    expect(parseScene(serializeScene(els))).toEqual({ ok: true, elements: els });
  });

  it("recusa curva com formato errado", () => {
    expect(parseScene({ version: 1, elements: [{ ...arrow(), bend: "x" }] }).ok).toBe(false);
    expect(parseScene({ version: 1, elements: [{ ...arrow(), bend: [1] }] }).ok).toBe(false);
    expect(parseScene({ version: 1, elements: [{ ...arrow(), bend: [1, "a"] }] }).ok).toBe(false);
  });
});
