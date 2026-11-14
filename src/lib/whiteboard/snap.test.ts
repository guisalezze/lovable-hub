import { describe, it, expect } from "vitest";
import { computeSnap } from "./snap";

const box = (x: number, y: number, width = 100, height = 50) => ({ x, y, width, height });
const T = 6;

describe("computeSnap", () => {
  it("sem outros elementos, nada muda", () => {
    expect(computeSnap(box(10, 10), [], T)).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it("bordas esquerdas próximas se alinham", () => {
    const r = computeSnap(box(203, 0), [box(200, 300)], T);
    expect(r.dx).toBe(-3);
    expect(r.guides.some((g) => g.axis === "x" && g.pos === 200)).toBe(true);
  });

  it("centros se alinham", () => {
    // centro do que se move: 253 ; centro do outro: 250
    const r = computeSnap(box(203, 0), [box(200, 300, 100, 50)], T);
    // a borda esquerda (3) e o centro (3) empatam: o resultado é o mesmo ajuste
    expect(r.dx).toBe(-3);
    const c = computeSnap(box(194, 0, 100, 50), [box(200, 300, 90, 50)], T); // centros: 244 vs 245
    expect(c.dx).toBe(1);
  });

  it("borda direita encosta na esquerda do outro (lado a lado)", () => {
    const r = computeSnap(box(97, 0), [box(200, 0)], 6); // direita do que se move: 197 -> 200
    expect(r.dx).toBe(3);
  });

  it("eixo Y funciona do mesmo jeito (topo, meio, base)", () => {
    expect(computeSnap(box(0, 102), [box(300, 100)], T).dy).toBe(-2);
    // meio do que se move (25) fica a 3 do topo do outro (22): é a correção mais curta
    expect(computeSnap(box(0, 0, 100, 50), [box(300, 22, 100, 100)], T).dy).toBe(-3);
  });

  it("os dois eixos ao mesmo tempo", () => {
    const r = computeSnap(box(203, 104), [box(200, 100)], T);
    expect(r).toMatchObject({ dx: -3, dy: -4 });
  });

  it("acima do limite, não gruda", () => {
    const r = computeSnap(box(220, 0), [box(200, 300)], T);
    expect(r.dx).toBe(0);
    expect(r.guides.filter((g) => g.axis === "x")).toEqual([]);
  });

  it("escolhe a correção mais curta entre vários candidatos", () => {
    const r = computeSnap(box(100, 0), [box(95, 300), box(102, 600)], T);
    expect(r.dx).toBe(2); // 102 está a 2; 95 está a 5
  });

  it("a guia vai de um elemento ao outro, cobrindo os dois", () => {
    const r = computeSnap(box(203, 0, 100, 50), [box(200, 300, 100, 50)], T);
    const g = r.guides.find((x) => x.axis === "x")!;
    expect(g.from).toBeLessThanOrEqual(0);
    expect(g.to).toBeGreaterThanOrEqual(350);
  });

  it("limite zero ou negativo não gruda nada", () => {
    expect(computeSnap(box(200, 0), [box(200, 300)], 0)).toEqual({ dx: 0, dy: 0, guides: [] });
  });
});
