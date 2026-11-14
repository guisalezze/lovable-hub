import { describe, it, expect } from "vitest";
import { createElement, parseScene, serializeScene } from "./scene";
import { boundaryPoint } from "./geometry";
import { findBindTarget, isBindable, pruneBindings, rebindArrow, syncBindings } from "./binding";
import { cloneElements } from "./ops";
import type { WbElement } from "./types";

const rect = (x: number, y: number, w = 100, h = 50, extra = {}) => createElement("rectangle", x, y, { width: w, height: h, ...extra });
const near = (p: { x: number; y: number }, x: number, y: number, tol = 0.6) => Math.hypot(p.x - x, p.y - y) <= tol;

describe("boundaryPoint", () => {
  it("retângulo: sai pela borda na direção do ponto", () => {
    expect(near(boundaryPoint(rect(0, 0), { x: 300, y: 25 }), 100, 25)).toBe(true);
    expect(near(boundaryPoint(rect(0, 0), { x: 50, y: -200 }), 50, 0)).toBe(true);
    expect(near(boundaryPoint(rect(0, 0), { x: 250, y: 125 }), 100, 50)).toBe(true); // diagonal: canto
  });

  it("a folga afasta o ponto da borda", () => {
    expect(near(boundaryPoint(rect(0, 0), { x: 300, y: 25 }, 2), 102, 25)).toBe(true);
  });

  it("elipse", () => {
    const el = createElement("ellipse", 0, 0, { width: 100, height: 50 });
    expect(near(boundaryPoint(el, { x: 300, y: 25 }), 100, 25)).toBe(true);
    expect(near(boundaryPoint(el, { x: 50, y: -200 }), 50, 0)).toBe(true);
  });

  it("losango", () => {
    const el = createElement("diamond", 0, 0, { width: 100, height: 50 });
    expect(near(boundaryPoint(el, { x: 300, y: 25 }), 100, 25)).toBe(true);
    expect(near(boundaryPoint(el, { x: 50, y: -200 }), 50, 0)).toBe(true);
    // direção (100,50) a partir do centro: cai na aresta (|x-50|/50 + |y-25|/25 = 1), não no canto da caixa
    expect(near(boundaryPoint(el, { x: 150, y: 75 }), 75, 37.5)).toBe(true);
  });

  it("elemento girado", () => {
    const turned = { ...rect(0, 0, 100, 20), angle: Math.PI / 2 }; // fica em pé: 20 de largura, 100 de altura
    expect(near(boundaryPoint(turned, { x: 50, y: -200 }), 50, -40)).toBe(true);
  });

  it("apontar para o próprio centro não gera NaN", () => {
    const p = boundaryPoint(rect(0, 0), { x: 50, y: 25 });
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });
});

describe("findBindTarget", () => {
  it("só formas e texto podem receber uma seta", () => {
    expect(isBindable(rect(0, 0))).toBe(true);
    expect(isBindable(createElement("text", 0, 0, { text: "a", width: 10, height: 10 }))).toBe(true);
    expect(isBindable(createElement("arrow", 0, 0, { points: [[0, 0], [1, 1]] }))).toBe(false);
    expect(isBindable(createElement("freedraw", 0, 0, { points: [[0, 0]] }))).toBe(false);
  });

  it("acha a forma sob o ponto, com folga na borda", () => {
    const a = rect(0, 0);
    expect(findBindTarget([a], { x: 50, y: 25 }, 8, new Set())?.id).toBe(a.id);
    expect(findBindTarget([a], { x: 104, y: 25 }, 8, new Set())?.id).toBe(a.id);
    expect(findBindTarget([a], { x: 140, y: 25 }, 8, new Set())).toBeNull();
  });

  it("entre formas sobrepostas escolhe a de cima", () => {
    const a = rect(0, 0);
    const b = rect(20, 10);
    expect(findBindTarget([a, b], { x: 50, y: 25 }, 8, new Set())?.id).toBe(b.id);
  });

  it("ignora os excluídos", () => {
    const a = rect(0, 0);
    expect(findBindTarget([a], { x: 50, y: 25 }, 8, new Set([a.id]))).toBeNull();
  });
});

describe("rebindArrow", () => {
  const A = rect(0, 0, 100, 50);
  const B = rect(300, 0, 100, 50);
  const byId = (els: WbElement[]) => new Map(els.map((e) => [e.id, e]));
  const arrowAB = () => createElement("arrow", 100, 25, { points: [[0, 0], [200, 0]], bindings: { start: A.id, end: B.id } });

  it("com as duas pontas presas, cada ponta fica na borda, na linha entre os centros", () => {
    const movedB = { ...B, y: 200 }; // B desceu
    const out = rebindArrow(arrowAB(), byId([A, movedB]));
    const start = { x: out.x + out.points![0][0], y: out.y + out.points![0][1] };
    const end = { x: out.x + out.points![1][0], y: out.y + out.points![1][1] };
    // centros: A (50,25) e B (350,225). A seta sai de A pela borda de baixo e chega em B pela de cima,
    // sempre sobre a reta entre os centros e com 2 de folga
    expect(near(start, 89.1, 51.1, 1)).toBe(true);
    expect(near(end, 310.9, 198.9, 1)).toBe(true);
    expect(out.bindings).toEqual({ start: A.id, end: B.id });
  });

  it("com uma ponta presa, a outra fica onde estava", () => {
    const arrow = createElement("arrow", 100, 25, { points: [[0, 0], [400, 300]], bindings: { start: A.id } });
    const out = rebindArrow(arrow, byId([A]));
    expect(out.x + out.points![1][0]).toBeCloseTo(500);
    expect(out.y + out.points![1][1]).toBeCloseTo(325);
  });

  it("forma que não existe mais: solta a ponta e a deixa onde estava", () => {
    const out = rebindArrow(arrowAB(), byId([A]));
    expect(out.bindings).toEqual({ start: A.id });
    expect(out.x + out.points![1][0]).toBeCloseTo(300);
  });

  it("mantém a curva com o mesmo afastamento da corda", () => {
    const arrow = { ...arrowAB(), bend: [100, -60] as [number, number] }; // controle a 60 acima do meio da corda
    const out = rebindArrow(arrow, byId([A, { ...B, y: 100 }]));
    const a = { x: out.x, y: out.y };
    const b = { x: out.x + out.points![1][0], y: out.y + out.points![1][1] };
    const control = { x: out.x + out.bend![0], y: out.y + out.bend![1] };
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    expect(control.x - mid.x).toBeCloseTo(0, 0);
    expect(control.y - mid.y).toBeCloseTo(-60, 0);
  });

  it("seta sem bindings volta igual", () => {
    const loose = createElement("arrow", 0, 0, { points: [[0, 0], [10, 10]] });
    expect(rebindArrow(loose, byId([A]))).toBe(loose);
  });
});

describe("pruneBindings / syncBindings", () => {
  const A = rect(0, 0);

  it("sem nada a mudar devolve o mesmo array (sem custo)", () => {
    const els = [A, createElement("arrow", 100, 25, { points: [[0, 0], [50, 0]], bindings: { start: A.id } })];
    expect(pruneBindings(els)).toBe(els);
  });

  it("tira as referências a elementos que não existem mais", () => {
    const arrow = createElement("arrow", 100, 25, { points: [[0, 0], [50, 0]], bindings: { start: A.id, end: "sumiu" } });
    const out = pruneBindings([A, arrow]);
    expect(out[1].bindings).toEqual({ start: A.id });
    const alone = pruneBindings([arrow]);
    expect(alone[0].bindings).toBeUndefined();
  });

  it("syncBindings recalcula todas as setas presas depois de qualquer mudança", () => {
    const B = rect(300, 0);
    const arrow = createElement("arrow", 100, 25, { points: [[0, 0], [200, 0]], bindings: { start: A.id, end: B.id } });
    const out = syncBindings([A, { ...B, x: 500 }, arrow]);
    expect(out[2].x + out[2].points![1][0]).toBeCloseTo(498, 0); // borda esquerda de B (500) menos a folga de 2
  });

  it("syncBindings sem nenhuma seta presa devolve o mesmo array", () => {
    const els = [A, createElement("arrow", 0, 0, { points: [[0, 0], [10, 0]] })];
    expect(syncBindings(els)).toBe(els);
  });
});

describe("cena e cópias com setas presas", () => {
  it("serializa e lê de volta", () => {
    const arrow = createElement("arrow", 0, 0, { points: [[0, 0], [10, 0]], bindings: { start: "a", end: "b" } });
    expect(parseScene(serializeScene([arrow]))).toEqual({ ok: true, elements: [arrow] });
  });

  it("recusa bindings com formato errado", () => {
    const base = createElement("arrow", 0, 0, { points: [[0, 0], [10, 0]] });
    expect(parseScene({ version: 1, elements: [{ ...base, bindings: "x" }] }).ok).toBe(false);
    expect(parseScene({ version: 1, elements: [{ ...base, bindings: { start: 5 } }] }).ok).toBe(false);
  });

  it("copiar seta junto com a forma refaz a ligação para a cópia; sem a forma, solta", () => {
    const A = rect(0, 0);
    const arrow = createElement("arrow", 100, 25, { points: [[0, 0], [50, 0]], bindings: { start: A.id } });
    const both = cloneElements([A, arrow], 20);
    expect(both[1].bindings).toEqual({ start: both[0].id });
    const onlyArrow = cloneElements([arrow], 20);
    expect(onlyArrow[0].bindings).toBeUndefined();
  });
});
