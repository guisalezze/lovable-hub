import { describe, it, expect, vi, beforeEach } from "vitest";
import { WhiteboardEngine, type PointerInput } from "./engine";
import { createElement } from "./scene";
import { styleClipboard } from "./ops";
import { resolveShortcut } from "./shortcuts";
import type { WbElement } from "./types";

const pt = (x: number, y: number): PointerInput => ({ x, y, shift: false, ctrl: false, button: 0 });

function setup(elements: WbElement[]) {
  const cb = { onChange: vi.fn(), onToolChange: vi.fn(), onSelectionChange: vi.fn(), onRequestRender: vi.fn() };
  const engine = new WhiteboardEngine(cb);
  engine.load(elements);
  return { engine, cb };
}
const click = (e: WhiteboardEngine, x: number, y: number) => {
  e.pointerDown(pt(x, y));
  e.pointerUp(pt(x, y));
};
const box = (type: "rectangle" | "ellipse", x: number, extra = {}) =>
  createElement(type, x, 0, { width: 100, height: 50, backgroundColor: "#ffffff", ...extra });

beforeEach(() => {
  styleClipboard.style = null;
});

describe("copiar e colar formatação", () => {
  it("leva cor, fundo, espessura e cantos de uma forma para outra, em um passo de histórico", () => {
    const src = box("rectangle", 0, { strokeColor: "#e03131", backgroundColor: "#ffd43b", strokeWidth: 7, roundness: "sharp" });
    const dst = box("ellipse", 300);
    const { engine, cb } = setup([src, dst]);
    click(engine, 50, 25);
    engine.copyStyle();
    engine.clearSelection();
    click(engine, 350, 25);
    engine.pasteStyle();
    expect(engine.elements[1]).toMatchObject({ strokeColor: "#e03131", backgroundColor: "#ffd43b", strokeWidth: 7, roundness: "sharp" });
    expect(cb.onChange).toHaveBeenCalledTimes(1);
    engine.undo();
    expect(engine.elements[1].strokeColor).toBe("auto");
  });

  it("não mexe no conteúdo nem na posição do destino", () => {
    const src = box("rectangle", 0, { strokeColor: "#e03131" });
    const dst = box("ellipse", 300, { text: "Etapa", runs: [{ text: "Etapa" }] });
    const { engine } = setup([src, dst]);
    click(engine, 50, 25);
    engine.copyStyle();
    engine.clearSelection();
    click(engine, 350, 25);
    engine.pasteStyle();
    expect(engine.elements[1]).toMatchObject({ x: 300, width: 100, text: "Etapa" });
  });

  it("texto: leva o tamanho, a fonte e o alinhamento da letra", () => {
    const src = createElement("text", 0, 0, { text: "a", fontSize: 56, fontFamily: "serif", textAlign: "center", strokeColor: "#1971c2", width: 30, height: 70 });
    const dst = createElement("text", 300, 0, { text: "b", fontSize: 20, width: 12, height: 25 });
    const { engine } = setup([src, dst]);
    click(engine, 10, 10);
    engine.copyStyle();
    engine.clearSelection();
    click(engine, 305, 10);
    engine.pasteStyle();
    expect(engine.elements[1]).toMatchObject({ fontSize: 56, fontFamily: "serif", textAlign: "center", strokeColor: "#1971c2" });
    expect(engine.elements[1].height).toBeCloseTo(56 * 1.25); // o texto foi remedido
  });

  it("forma ignora a parte de texto que não faz sentido (seta não ganha fonte)", () => {
    const src = createElement("text", 0, 0, { text: "a", fontSize: 56, strokeColor: "#1971c2", width: 30, height: 70 });
    const arrow = createElement("arrow", 0, 300, { points: [[0, 0], [100, 0]] });
    const { engine } = setup([src, arrow]);
    click(engine, 10, 10);
    engine.copyStyle();
    engine.clearSelection();
    click(engine, 20, 300);
    engine.pasteStyle();
    expect(engine.elements[1].strokeColor).toBe("#1971c2");
    expect(engine.elements[1].fontSize).toBeUndefined();
  });

  it("cola em vários de uma vez, e elemento bloqueado fica de fora", () => {
    const src = box("rectangle", 0, { strokeColor: "#e03131" });
    const a = box("ellipse", 300);
    const b = box("ellipse", 600, { locked: true });
    const { engine } = setup([src, a, b]);
    click(engine, 50, 25);
    engine.copyStyle();
    engine.selectAll();
    engine.pasteStyle();
    expect(engine.elements[1].strokeColor).toBe("#e03131");
    expect(engine.elements[2].strokeColor).toBe("auto");
  });

  it("copiar de vários usa o primeiro selecionado", () => {
    const a = box("rectangle", 0, { strokeColor: "#e03131" });
    const b = box("rectangle", 300, { strokeColor: "#2f9e44" });
    const dst = box("ellipse", 600);
    const { engine } = setup([a, b, dst]);
    engine.selectAll();
    engine.copyStyle();
    engine.clearSelection();
    click(engine, 650, 25);
    engine.pasteStyle();
    expect(engine.elements[2].strokeColor).toBe("#e03131");
  });

  it("sem seleção ou sem nada copiado não faz nada nem cria histórico", () => {
    const { engine, cb } = setup([box("rectangle", 0, { strokeColor: "#e03131" })]);
    engine.copyStyle(); // nada selecionado
    expect(styleClipboard.style).toBeNull();
    click(engine, 50, 25);
    engine.pasteStyle(); // nada copiado
    expect(cb.onChange).not.toHaveBeenCalled();
  });

  it("colar a mesma formatação no mesmo elemento não cria passo", () => {
    const { engine, cb } = setup([box("rectangle", 0, { strokeColor: "#e03131" })]);
    click(engine, 50, 25);
    engine.copyStyle();
    engine.pasteStyle();
    expect(cb.onChange).not.toHaveBeenCalled();
  });

  it("a formatação copiada vale ao trocar de quadro (como a área de transferência)", () => {
    const first = setup([box("rectangle", 0, { strokeColor: "#e03131" })]);
    click(first.engine, 50, 25);
    first.engine.copyStyle();
    const second = setup([box("ellipse", 0)]);
    click(second.engine, 50, 25);
    second.engine.pasteStyle();
    expect(second.engine.elements[0].strokeColor).toBe("#e03131");
  });
});

describe("atalhos de formatação e Alt", () => {
  const key = (k: string, extra: Record<string, unknown> = {}) => ({
    key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, target: document.body as EventTarget | null, ...extra,
  });

  it("Ctrl+Alt+C copia e Ctrl+Alt+V cola a formatação", () => {
    expect(resolveShortcut(key("c", { ctrlKey: true, altKey: true }))).toEqual({ kind: "copyStyle" });
    expect(resolveShortcut(key("v", { ctrlKey: true, altKey: true }))).toEqual({ kind: "pasteStyle" });
  });

  it("Alt + letra não vira atalho de ferramenta (era capturado por engano)", () => {
    expect(resolveShortcut(key("d", { altKey: true }))).toBeNull();
    expect(resolveShortcut(key("r", { altKey: true }))).toBeNull();
  });

  it("Ctrl+Alt com outra tecla não é nada nosso", () => {
    expect(resolveShortcut(key("z", { ctrlKey: true, altKey: true }))).toBeNull();
  });

  it("nada disso dispara dentro de um campo de texto", () => {
    const target = document.createElement("input");
    expect(resolveShortcut(key("c", { ctrlKey: true, altKey: true, target }))).toBeNull();
  });
});
