import { describe, it, expect, vi, beforeEach } from "vitest";
import { WhiteboardEngine, type PointerInput } from "./engine";
import { createElement } from "./scene";
import type { WbElement } from "./types";

const pt = (x: number, y: number, extra: Partial<PointerInput> = {}): PointerInput => ({
  x, y, shift: false, ctrl: false, button: 0, ...extra,
});

function setup() {
  const cb = {
    onChange: vi.fn(),
    onToolChange: vi.fn(),
    onSelectionChange: vi.fn(),
    onRequestRender: vi.fn(),
  };
  return { engine: new WhiteboardEngine(cb), cb };
}

const filled = (x: number, y: number, w = 100, h = 50, extra: Partial<WbElement> = {}) =>
  createElement("rectangle", x, y, { width: w, height: h, backgroundColor: "#ffffff", ...extra });

function drag(engine: WhiteboardEngine, from: [number, number], to: [number, number], extra: Partial<PointerInput> = {}) {
  engine.pointerDown(pt(from[0], from[1], extra));
  engine.pointerMove(pt(to[0], to[1], extra));
  engine.pointerUp(pt(to[0], to[1], extra));
}

function click(engine: WhiteboardEngine, x: number, y: number, extra: Partial<PointerInput> = {}) {
  engine.pointerDown(pt(x, y, extra));
  engine.pointerUp(pt(x, y, extra));
}

describe("criação de formas", () => {
  it("arrastar com o retângulo cria um elemento e volta para a seleção", () => {
    const { engine, cb } = setup();
    engine.setTool("rectangle");
    drag(engine, [10, 10], [110, 60]);
    expect(engine.elements).toHaveLength(1);
    expect(engine.elements[0]).toMatchObject({ type: "rectangle", x: 10, y: 10, width: 100, height: 50 });
    expect(cb.onChange).toHaveBeenCalledTimes(1);
    expect(engine.tool).toBe("select");
    expect(cb.onToolChange).toHaveBeenLastCalledWith("select");
    expect(engine.selectedIds.has(engine.elements[0].id)).toBe(true);
  });

  it("arrastar para cima e para a esquerda gera tamanho positivo", () => {
    const { engine } = setup();
    engine.setTool("ellipse");
    drag(engine, [110, 60], [10, 10]);
    expect(engine.elements[0]).toMatchObject({ x: 10, y: 10, width: 100, height: 50 });
  });

  it("clique sem arrastar não cria elemento", () => {
    const { engine, cb } = setup();
    engine.setTool("rectangle");
    click(engine, 10, 10);
    expect(engine.elements).toHaveLength(0);
    expect(cb.onChange).not.toHaveBeenCalled();
  });

  it("linha e seta guardam dois pontos relativos", () => {
    for (const type of ["line", "arrow"] as const) {
      const { engine } = setup();
      engine.setTool(type);
      drag(engine, [10, 10], [110, 60]);
      expect(engine.elements[0]).toMatchObject({ type, x: 10, y: 10, points: [[0, 0], [100, 50]] });
    }
  });

  it("shift mantém a forma quadrada", () => {
    const { engine } = setup();
    engine.setTool("rectangle");
    drag(engine, [0, 0], [100, 40], { shift: true });
    expect(engine.elements[0].width).toBe(engine.elements[0].height);
  });
});

describe("lápis", () => {
  it("acumula pontos, ignora repetidos e mantém a ferramenta", () => {
    const { engine, cb } = setup();
    engine.setTool("pencil");
    engine.pointerDown(pt(0, 0));
    engine.pointerMove(pt(5, 5));
    engine.pointerMove(pt(5, 5));
    engine.pointerMove(pt(10, 0));
    engine.pointerUp(pt(10, 0));
    expect(engine.elements[0]).toMatchObject({ type: "freedraw", points: [[0, 0], [5, 5], [10, 0]] });
    expect(engine.tool).toBe("pencil");
    expect(cb.onChange).toHaveBeenCalledTimes(1);
  });
});

describe("seleção e movimento", () => {
  let engine: WhiteboardEngine;
  let cb: ReturnType<typeof setup>["cb"];
  beforeEach(() => {
    ({ engine, cb } = setup());
  });

  it("clicar seleciona; clicar no vazio limpa", () => {
    const a = filled(0, 0);
    engine.load([a]);
    click(engine, 50, 25);
    expect([...engine.selectedIds]).toEqual([a.id]);
    click(engine, 500, 500);
    expect(engine.selectedIds.size).toBe(0);
    expect(cb.onChange).not.toHaveBeenCalled();
  });

  it("arrastar move o elemento pelo delta dividido pelo zoom", () => {
    engine.load([filled(0, 0)]);
    engine.camera = { x: 0, y: 0, zoom: 2 };
    drag(engine, [100, 50], [140, 90]); // mundo: (50,25) -> (70,45)
    expect(engine.elements[0]).toMatchObject({ x: 20, y: 20 });
    expect(cb.onChange).toHaveBeenCalledTimes(1);
  });

  it("shift+clique alterna a seleção", () => {
    const a = filled(0, 0);
    const b = filled(200, 0);
    engine.load([a, b]);
    click(engine, 50, 25);
    click(engine, 250, 25, { shift: true });
    expect(engine.selectedIds).toEqual(new Set([a.id, b.id]));
    click(engine, 50, 25, { shift: true });
    expect(engine.selectedIds).toEqual(new Set([b.id]));
  });

  it("arrastar no vazio faz seleção por área", () => {
    const a = filled(0, 0, 10, 10);
    const b = filled(200, 200, 10, 10);
    engine.load([a, b]);
    engine.pointerDown(pt(-5, -5));
    engine.pointerMove(pt(20, 20));
    expect(engine.marquee).not.toBeNull();
    engine.pointerUp(pt(20, 20));
    expect(engine.marquee).toBeNull();
    expect(engine.selectedIds).toEqual(new Set([a.id]));
  });

  it("desfazer volta a posição anterior ao movimento", () => {
    engine.load([filled(0, 0)]);
    drag(engine, [50, 25], [80, 55]);
    expect(engine.elements[0].x).toBe(30);
    engine.undo();
    expect(engine.elements[0].x).toBe(0);
    engine.redo();
    expect(engine.elements[0].x).toBe(30);
  });

  it("elemento bloqueado não move nem redimensiona", () => {
    engine.load([filled(0, 0, 100, 50, { locked: true })]);
    drag(engine, [50, 25], [90, 90]);
    drag(engine, [100, 50], [150, 80]);
    expect(engine.elements[0]).toMatchObject({ x: 0, y: 0, width: 100, height: 50 });
    expect(cb.onChange).not.toHaveBeenCalled();
  });
});

describe("redimensionar", () => {
  it("arrastar a alça se muda largura e altura", () => {
    const { engine, cb } = setup();
    engine.load([filled(0, 0)]);
    click(engine, 50, 25); // seleciona
    drag(engine, [100, 50], [150, 80]);
    expect(engine.elements[0]).toMatchObject({ x: 0, y: 0, width: 150, height: 80 });
    expect(cb.onChange).toHaveBeenCalledTimes(1);
  });

  it("linha selecionada escala seus pontos", () => {
    const { engine } = setup();
    const line = createElement("line", 0, 0, { points: [[0, 0], [100, 50]] });
    engine.load([line]);
    click(engine, 50, 25);
    drag(engine, [100, 50], [200, 100]);
    expect(engine.elements[0].points).toEqual([[0, 0], [200, 100]]);
  });
});

describe("borracha, mão e apagar", () => {
  it("a borracha apaga o que toca em um passo de histórico", () => {
    const { engine, cb } = setup();
    engine.load([filled(0, 0, 50, 50), filled(100, 0, 50, 50), filled(500, 500, 50, 50)]);
    engine.setTool("eraser");
    drag(engine, [10, 10], [110, 10]);
    expect(engine.elements).toHaveLength(1);
    expect(cb.onChange).toHaveBeenCalledTimes(1);
    expect(engine.tool).toBe("eraser");
    engine.undo();
    expect(engine.elements).toHaveLength(3);
  });

  it("a mão arrasta a câmera", () => {
    const { engine } = setup();
    engine.setTool("hand");
    drag(engine, [100, 100], [150, 120]);
    expect(engine.camera).toEqual({ x: -50, y: -20, zoom: 1 });
  });

  it("Delete remove a seleção e desfazer restaura", () => {
    const { engine, cb } = setup();
    engine.load([filled(0, 0)]);
    click(engine, 50, 25);
    engine.deleteSelection();
    expect(engine.elements).toHaveLength(0);
    expect(cb.onChange).toHaveBeenCalledTimes(1);
    engine.undo();
    expect(engine.elements).toHaveLength(1);
  });
});

describe("cancelar o gesto no meio", () => {
  it("criação: o elemento em construção some, sem onChange", () => {
    const { engine, cb } = setup();
    engine.setTool("rectangle");
    engine.pointerDown(pt(10, 10));
    engine.pointerMove(pt(100, 100));
    engine.pointerCancel();
    expect(engine.elements).toHaveLength(0);
    expect(cb.onChange).not.toHaveBeenCalled();
    engine.pointerMove(pt(200, 200)); // depois do cancelamento não desenha mais nada
    expect(engine.elements).toHaveLength(0);
  });

  it("movimento: volta à posição original", () => {
    const { engine, cb } = setup();
    engine.load([filled(0, 0)]);
    engine.pointerDown(pt(50, 25));
    engine.pointerMove(pt(90, 90));
    engine.pointerCancel();
    expect(engine.elements[0]).toMatchObject({ x: 0, y: 0 });
    expect(cb.onChange).not.toHaveBeenCalled();
  });

  it("borracha: devolve o que tinha apagado", () => {
    const { engine, cb } = setup();
    engine.load([filled(0, 0)]);
    engine.setTool("eraser");
    engine.pointerDown(pt(10, 10));
    expect(engine.elements).toHaveLength(0);
    engine.pointerCancel();
    expect(engine.elements).toHaveLength(1);
    expect(cb.onChange).not.toHaveBeenCalled();
  });

  it("seleção por área: a caixa some", () => {
    const { engine } = setup();
    engine.pointerDown(pt(0, 0));
    engine.pointerMove(pt(50, 50));
    engine.pointerCancel();
    expect(engine.marquee).toBeNull();
  });
});

describe("estado geral", () => {
  it("load não dispara onChange e zera o histórico", () => {
    const { engine, cb } = setup();
    engine.load([filled(0, 0)]);
    engine.undo();
    expect(cb.onChange).not.toHaveBeenCalled();
    expect(engine.elements).toHaveLength(1);
  });

  it("trocar de ferramenta limpa a seleção e avisa", () => {
    const { engine, cb } = setup();
    engine.load([filled(0, 0)]);
    click(engine, 50, 25);
    engine.setTool("pencil");
    expect(engine.selectedIds.size).toBe(0);
    expect(cb.onToolChange).toHaveBeenLastCalledWith("pencil");
  });

  it("selectAll seleciona tudo e as trilhas do laser começam vazias", () => {
    const { engine } = setup();
    engine.load([filled(0, 0), filled(200, 0)]);
    engine.selectAll();
    expect(engine.selectedIds.size).toBe(2);
    expect(engine.trails).toEqual([]);
  });

  it("clearSelection limpa a seleção e avisa uma vez", () => {
    const { engine, cb } = setup();
    engine.load([filled(0, 0)]);
    click(engine, 50, 25);
    cb.onSelectionChange.mockClear();
    engine.clearSelection();
    expect(engine.selectedIds.size).toBe(0);
    expect(cb.onSelectionChange).toHaveBeenCalledTimes(1);
    engine.clearSelection();
    expect(cb.onSelectionChange).toHaveBeenCalledTimes(1);
  });
});
