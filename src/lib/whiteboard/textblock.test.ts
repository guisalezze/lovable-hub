import { describe, it, expect } from "vitest";
import { createElement } from "./scene";
import { hasText, refitElement, textBlockFor, NOTE_PADDING, SHAPE_PADDING, TEXT_TYPES } from "./textblock";
import { listContinuation } from "./richtext";

const shape = (type: "rectangle" | "ellipse" | "diamond" | "note", extra = {}) =>
  createElement(type, 0, 0, { width: 200, height: 100, fontSize: 20, ...extra });

describe("textBlockFor: onde o texto fica", () => {
  it("texto solto começa no canto do elemento e não quebra sozinho", () => {
    const el = createElement("text", 30, 40, { text: "ola mundo", fontSize: 20 });
    const b = textBlockFor(el);
    expect(b.x).toBe(30);
    expect(b.y).toBe(40);
    expect(b.layout.lines).toHaveLength(1);
  });

  it("dentro de uma forma o texto fica centrado na horizontal e na vertical", () => {
    const el = shape("rectangle", { text: "ab" });
    const b = textBlockFor(el);
    const seg = b.layout.lines[0].segments[0];
    const centerX = b.x + seg.x + seg.width / 2;
    expect(centerX).toBeCloseTo(100, 0);
    const centerY = b.y + b.layout.lines[0].y + b.layout.lines[0].height / 2;
    expect(centerY).toBeCloseTo(50, 0);
  });

  it("a forma tem margem interna: o texto quebra antes de encostar na borda", () => {
    const el = shape("rectangle", { text: "palavra ".repeat(30) });
    const b = textBlockFor(el);
    expect(b.layout.lines.length).toBeGreaterThan(1);
    expect(b.layout.width).toBeLessThanOrEqual(200 - 2 * SHAPE_PADDING);
  });

  it("elipse e losango usam só parte da largura", () => {
    const rect = textBlockFor(shape("rectangle", { text: "x" })).layout.width;
    expect(textBlockFor(shape("ellipse", { text: "x" })).layout.width).toBeLessThan(rect);
    expect(textBlockFor(shape("diamond", { text: "x" })).layout.width).toBeLessThan(rect);
  });

  it("nota: texto no canto de cima, à esquerda, com margem", () => {
    const b = textBlockFor(shape("note", { text: "oi" }));
    expect(b.x).toBe(NOTE_PADDING);
    expect(b.y).toBe(NOTE_PADDING);
    expect(b.layout.lines[0].segments[0].x).toBe(0);
  });

  it("o alinhamento escolhido vale (nota com texto no centro)", () => {
    const b = textBlockFor(shape("note", { text: "oi", textAlign: "center" }));
    expect(b.layout.lines[0].segments[0].x).toBeGreaterThan(10);
  });

  it("usa os trechos com estilo quando existem", () => {
    const el = createElement("text", 0, 0, { text: "ab", runs: [{ text: "a" }, { text: "b", bold: true }], fontSize: 20 });
    expect(textBlockFor(el).layout.lines[0].segments).toHaveLength(2);
  });
});

describe("refitElement: o elemento acompanha o texto", () => {
  it("texto solto ganha a largura e a altura do texto", () => {
    const el = createElement("text", 0, 0, { text: "a\nbb", fontSize: 20, width: 1, height: 1 });
    const r = refitElement(el);
    expect(r.height).toBeCloseTo(2 * 20 * 1.25);
    expect(r.width).toBeGreaterThan(1);
  });

  it("nota cresce para caber o texto, mas nunca encolhe", () => {
    const long = shape("note", { text: "palavra ".repeat(60), width: 150, height: 60 });
    expect(refitElement(long).height).toBeGreaterThan(60);
    const short = shape("note", { text: "oi", width: 150, height: 200 });
    expect(refitElement(short)).toBe(short);
  });

  it("formas não mudam de tamanho por causa do texto", () => {
    const el = shape("rectangle", { text: "palavra ".repeat(60) });
    expect(refitElement(el)).toBe(el);
  });
});

describe("hasText / TEXT_TYPES", () => {
  it("quais elementos guardam texto", () => {
    expect(TEXT_TYPES).toEqual(expect.arrayContaining(["text", "note", "rectangle", "ellipse", "diamond"]));
    expect(TEXT_TYPES).not.toContain("arrow");
    expect(TEXT_TYPES).not.toContain("freedraw");
  });

  it("hasText só é verdadeiro com conteúdo", () => {
    expect(hasText(shape("rectangle", { text: "x" }))).toBe(true);
    expect(hasText(shape("rectangle", { runs: [{ text: "x", bold: true }] }))).toBe(true);
    expect(hasText(shape("rectangle"))).toBe(false);
    expect(hasText(createElement("arrow", 0, 0, { text: "x" }))).toBe(false);
  });
});

describe("listContinuation: Enter dentro de uma lista", () => {
  it("continua o marcador", () => {
    expect(listContinuation("- item")).toEqual({ action: "continue", marker: "- " });
    expect(listContinuation("• item")).toEqual({ action: "continue", marker: "• " });
    expect(listContinuation("3. item")).toEqual({ action: "continue", marker: "4. " });
  });

  it("item vazio encerra a lista", () => {
    expect(listContinuation("- ")).toEqual({ action: "end", length: 2 });
    expect(listContinuation("12. ")).toEqual({ action: "end", length: 4 });
  });

  it("linha comum não é lista", () => {
    expect(listContinuation("abc")).toBeNull();
    expect(listContinuation("-x")).toBeNull();
    expect(listContinuation("1.x")).toBeNull();
    expect(listContinuation("")).toBeNull();
  });
});
