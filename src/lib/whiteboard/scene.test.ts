import { describe, it, expect } from "vitest";
import { createElement, serializeScene, parseScene } from "./scene";

describe("createElement", () => {
  it("cria um retângulo com os valores padrão", () => {
    const el = createElement("rectangle", 10, 20);
    expect(el).toMatchObject({
      type: "rectangle",
      x: 10,
      y: 20,
      width: 0,
      height: 0,
      angle: 0,
      strokeColor: "auto",
      backgroundColor: "transparent",
      strokeWidth: 2,
      roundness: "round",
      locked: false,
      groupId: null,
    });
  });

  it("gera id e seed diferentes a cada elemento", () => {
    const a = createElement("ellipse", 0, 0);
    const b = createElement("ellipse", 0, 0);
    expect(a.id).not.toBe(b.id);
    expect(a.seed).not.toBe(b.seed);
  });

  it("aceita estilo por cima do padrão", () => {
    const el = createElement("line", 0, 0, { strokeColor: "#e03131", strokeWidth: 4 });
    expect(el.strokeColor).toBe("#e03131");
    expect(el.strokeWidth).toBe(4);
  });
});

describe("serializeScene / parseScene", () => {
  it("faz ida e volta sem perder nada", () => {
    const els = [
      createElement("rectangle", 1, 2, { width: 30, height: 40 }),
      createElement("freedraw", 0, 0, { points: [[0, 0], [5, 5]] }),
    ];
    const result = parseScene(serializeScene(els));
    expect(result).toEqual({ ok: true, elements: els });
  });

  it("recusa versão desconhecida", () => {
    const result = parseScene({ version: 2, elements: [] });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("versão") });
  });

  it("recusa lixo e formato inválido", () => {
    expect(parseScene("lixo").ok).toBe(false);
    expect(parseScene(null).ok).toBe(false);
    expect(parseScene({ version: 1, elements: "x" }).ok).toBe(false);
  });

  it("recusa elemento com tipo inválido em vez de descartar em silêncio", () => {
    const bad = { ...createElement("rectangle", 0, 0), type: "triangulo" };
    const result = parseScene({ version: 1, elements: [bad] });
    expect(result.ok).toBe(false);
  });

  it("recusa elemento com campo de tipo errado", () => {
    const bad = { ...createElement("rectangle", 0, 0), x: "10" };
    expect(parseScene({ version: 1, elements: [bad] }).ok).toBe(false);
  });
});
