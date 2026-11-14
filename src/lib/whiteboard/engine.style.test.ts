import { describe, it, expect, vi } from "vitest";
import { WhiteboardEngine, type PointerInput } from "./engine";
import { createElement } from "./scene";
import { STROKE_COLORS, FILL_COLORS, STROKE_WIDTHS } from "./palette";

const pt = (x: number, y: number, extra: Partial<PointerInput> = {}): PointerInput => ({ x, y, shift: false, ctrl: false, button: 0, ...extra });

function setup() {
  const cb = { onChange: vi.fn(), onToolChange: vi.fn(), onSelectionChange: vi.fn(), onRequestRender: vi.fn() };
  return { engine: new WhiteboardEngine(cb), cb };
}

const box = (x: number, extra = {}) => createElement("rectangle", x, 0, { width: 100, height: 50, backgroundColor: "#ffffff", ...extra });

describe("applyStyle com seleção", () => {
  it("muda todos os selecionados e um desfazer volta todos de uma vez", () => {
    const { engine, cb } = setup();
    engine.load([box(0), box(300)]);
    engine.selectAll();
    engine.applyStyle({ strokeColor: "#e03131" });
    expect(engine.elements.map((e) => e.strokeColor)).toEqual(["#e03131", "#e03131"]);
    expect(cb.onChange).toHaveBeenCalledTimes(1);
    engine.undo();
    expect(engine.elements.map((e) => e.strokeColor)).toEqual(["auto", "auto"]);
  });

  it("aplica espessura, fundo e cantos", () => {
    const { engine } = setup();
    engine.load([box(0)]);
    engine.selectAll();
    engine.applyStyle({ strokeWidth: 7, backgroundColor: "transparent", roundness: "sharp" });
    expect(engine.elements[0]).toMatchObject({ strokeWidth: 7, backgroundColor: "transparent", roundness: "sharp" });
  });

  it("elemento bloqueado não é alterado", () => {
    const { engine } = setup();
    engine.load([box(0, { locked: true }), box(300)]);
    engine.selectAll();
    engine.applyStyle({ strokeColor: "#1971c2" });
    expect(engine.elements[0].strokeColor).toBe("auto");
    expect(engine.elements[1].strokeColor).toBe("#1971c2");
  });

  it("aplicar o valor que já está lá não cria passo de histórico", () => {
    const { engine, cb } = setup();
    engine.load([box(0)]);
    engine.selectAll();
    engine.applyStyle({ strokeColor: "auto" });
    expect(cb.onChange).not.toHaveBeenCalled();
    expect(engine.canUndo).toBe(false);
  });
});

describe("applyStyle sem seleção (estilo das próximas formas)", () => {
  it("a próxima forma nasce com o estilo escolhido", () => {
    const { engine, cb } = setup();
    engine.applyStyle({ strokeWidth: 4, backgroundColor: "#8ce99a" });
    expect(cb.onChange).not.toHaveBeenCalled(); // não mexe na cena
    engine.setTool("rectangle");
    engine.pointerDown(pt(0, 0));
    engine.pointerMove(pt(50, 50));
    engine.pointerUp(pt(50, 50));
    expect(engine.elements[0]).toMatchObject({ strokeWidth: 4, backgroundColor: "#8ce99a" });
  });

  it("o lápis também usa cor e espessura escolhidas", () => {
    const { engine } = setup();
    engine.applyStyle({ strokeColor: "#f08c00", strokeWidth: 7 });
    engine.setTool("pencil");
    engine.pointerDown(pt(0, 0));
    engine.pointerMove(pt(10, 10));
    engine.pointerUp(pt(10, 10));
    expect(engine.elements[0]).toMatchObject({ type: "freedraw", strokeColor: "#f08c00", strokeWidth: 7 });
  });
});

describe("getStyleOfSelection / getActiveStyle", () => {
  it("sem seleção: getStyleOfSelection é null e getActiveStyle mostra o padrão", () => {
    const { engine } = setup();
    expect(engine.getStyleOfSelection()).toBeNull();
    expect(engine.getActiveStyle()).toEqual({ strokeColor: "auto", backgroundColor: "transparent", strokeWidth: 2, roundness: "round", fontSize: 24, fontFamily: "sans", textAlign: "left" });
    engine.applyStyle({ strokeWidth: 7 });
    expect(engine.getActiveStyle().strokeWidth).toBe(7);
  });

  it("valor comum aparece; valor misturado vira undefined", () => {
    const { engine } = setup();
    engine.load([box(0, { strokeWidth: 4 }), box(300, { strokeWidth: 7 })]);
    engine.selectAll();
    const s = engine.getStyleOfSelection();
    expect(s.strokeWidth).toBeUndefined();
    expect(s.strokeColor).toBe("auto");
    expect(s.roundness).toBe("round");
  });
});

describe("paleta", () => {
  it("começa com auto/transparente e tem as três espessuras", () => {
    expect(STROKE_COLORS[0]).toBe("auto");
    expect(FILL_COLORS[0]).toBe("transparent");
    expect(STROKE_WIDTHS).toEqual([2, 4, 7]);
  });
});
