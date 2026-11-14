import { describe, it, expect } from "vitest";
import { measureText, textLines, TEXT_LINE_HEIGHT } from "./text";

describe("textLines", () => {
  it("separa por quebra de linha e mantém linhas vazias", () => {
    expect(textLines("a\nb\n\nc")).toEqual(["a", "b", "", "c"]);
    expect(textLines("")).toEqual([""]);
  });

  it("trata \\r\\n como uma quebra só", () => {
    expect(textLines("a\r\nb")).toEqual(["a", "b"]);
  });
});

describe("measureText", () => {
  it("a altura é o número de linhas vezes o espaçamento", () => {
    expect(measureText("abc", 20).height).toBeCloseTo(20 * TEXT_LINE_HEIGHT);
    expect(measureText("abc\ndef", 20).height).toBeCloseTo(2 * 20 * TEXT_LINE_HEIGHT);
  });

  it("texto maior é mais largo, e fonte maior também", () => {
    expect(measureText("abcdefgh", 20).width).toBeGreaterThan(measureText("abc", 20).width);
    expect(measureText("abc", 40).width).toBeGreaterThan(measureText("abc", 20).width);
  });

  it("a largura é a da linha mais comprida", () => {
    const w = measureText("abc\nabcdefghij\nab", 20).width;
    expect(w).toBeCloseTo(measureText("abcdefghij", 20).width);
  });

  it("texto vazio ainda tem tamanho positivo (dá para clicar e editar)", () => {
    const m = measureText("", 20);
    expect(m.width).toBeGreaterThan(0);
    expect(m.height).toBeGreaterThan(0);
  });

  it("tamanho de fonte inválido não gera NaN", () => {
    const m = measureText("abc", 0);
    expect(Number.isFinite(m.width) && Number.isFinite(m.height)).toBe(true);
    expect(m.width).toBeGreaterThan(0);
  });
});
