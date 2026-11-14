import { describe, it, expect, vi, beforeEach } from "vitest";
import { WhiteboardEngine, type PointerInput } from "./engine";
import { createElement } from "./scene";
import { clipboard } from "./ops";
import type { WbElement } from "./types";

const pt = (x: number, y: number, extra: Partial<PointerInput> = {}): PointerInput => ({ x, y, shift: false, ctrl: false, button: 0, ...extra });

function setup() {
  const cb = { onChange: vi.fn(), onToolChange: vi.fn(), onSelectionChange: vi.fn(), onRequestRender: vi.fn() };
  return { engine: new WhiteboardEngine(cb), cb };
}

const filled = (x: number, y = 0, extra: Partial<WbElement> = {}) =>
  createElement("rectangle", x, y, { width: 100, height: 50, backgroundColor: "#ffffff", ...extra });

const click = (e: WhiteboardEngine, x: number, y: number, extra: Partial<PointerInput> = {}) => {
  e.pointerDown(pt(x, y, extra));
  e.pointerUp(pt(x, y, extra));
};
const drag = (e: WhiteboardEngine, from: [number, number], to: [number, number], extra: Partial<PointerInput> = {}) => {
  e.pointerDown(pt(from[0], from[1], extra));
  e.pointerMove(pt(to[0], to[1], extra));
  e.pointerUp(pt(to[0], to[1], extra));
};

beforeEach(() => {
  clipboard.items = [];
});

describe("copiar, recortar, colar, duplicar", () => {
  it("copiar e colar cria cópia deslocada e seleciona só a cópia", () => {
    const { engine, cb } = setup();
    const a = filled(0);
    engine.load([a]);
    click(engine, 50, 25);
    engine.copy();
    expect(cb.onChange).not.toHaveBeenCalled();
    engine.paste();
    expect(engine.elements).toHaveLength(2);
    expect(engine.elements[1]).toMatchObject({ x: 20, y: 20 });
    expect([...engine.selectedIds]).toEqual([engine.elements[1].id]);
    expect(cb.onChange).toHaveBeenCalledTimes(1);
    engine.undo();
    expect(engine.elements).toHaveLength(1);
  });

  it("colar duas vezes não empilha as cópias no mesmo lugar", () => {
    const { engine } = setup();
    engine.load([filled(0)]);
    click(engine, 50, 25);
    engine.copy();
    engine.paste();
    engine.paste();
    const xs = engine.elements.map((e) => e.x);
    expect(new Set(xs).size).toBe(3);
  });

  it("colar com a área de transferência vazia não faz nada", () => {
    const { engine, cb } = setup();
    engine.load([filled(0)]);
    engine.paste();
    expect(engine.elements).toHaveLength(1);
    expect(cb.onChange).not.toHaveBeenCalled();
  });

  it("a área de transferência vale entre motores diferentes (trocar de quadro)", () => {
    const first = setup().engine;
    first.load([filled(0)]);
    click(first, 50, 25);
    first.copy();
    const second = setup().engine;
    second.load([]);
    second.paste();
    expect(second.elements).toHaveLength(1);
  });

  it("recortar copia e apaga", () => {
    const { engine } = setup();
    engine.load([filled(0)]);
    click(engine, 50, 25);
    engine.cut();
    expect(engine.elements).toHaveLength(0);
    engine.paste();
    expect(engine.elements).toHaveLength(1);
  });

  it("duplicar põe a cópia por cima e a seleciona", () => {
    const { engine, cb } = setup();
    engine.load([filled(0)]);
    click(engine, 50, 25);
    engine.duplicate();
    expect(engine.elements).toHaveLength(2);
    expect([...engine.selectedIds]).toEqual([engine.elements[1].id]);
    expect(cb.onChange).toHaveBeenCalledTimes(1);
  });

  it("duplicar sem seleção não faz nada", () => {
    const { engine, cb } = setup();
    engine.load([filled(0)]);
    engine.duplicate();
    expect(engine.elements).toHaveLength(1);
    expect(cb.onChange).not.toHaveBeenCalled();
  });
});

describe("grupos", () => {
  it("agrupar; clicar em um membro seleciona o grupo inteiro; mover leva todos", () => {
    const { engine } = setup();
    engine.load([filled(0), filled(300)]);
    engine.selectAll();
    engine.group();
    expect(engine.elements[0].groupId).not.toBeNull();
    expect(engine.elements[0].groupId).toBe(engine.elements[1].groupId);
    engine.clearSelection();
    click(engine, 50, 25);
    expect(engine.selectedIds.size).toBe(2);
    drag(engine, [50, 25], [80, 25]);
    expect(engine.elements.map((e) => e.x)).toEqual([30, 330]);
  });

  it("seleção por área também pega o grupo todo", () => {
    const { engine } = setup();
    engine.load([filled(0), filled(600)]);
    engine.selectAll();
    engine.group();
    engine.clearSelection();
    engine.pointerDown(pt(-10, -10));
    engine.pointerMove(pt(20, 20)); // toca só o primeiro
    engine.pointerUp(pt(20, 20));
    expect(engine.selectedIds.size).toBe(2);
  });

  it("desagrupar solta os elementos", () => {
    const { engine } = setup();
    engine.load([filled(0), filled(300)]);
    engine.selectAll();
    engine.group();
    engine.ungroup();
    expect(engine.elements.every((e) => e.groupId === null)).toBe(true);
    engine.undo();
    expect(engine.elements[0].groupId).not.toBeNull();
  });

  it("agrupar com um elemento só não faz nada", () => {
    const { engine, cb } = setup();
    engine.load([filled(0)]);
    click(engine, 50, 25);
    engine.group();
    expect(cb.onChange).not.toHaveBeenCalled();
  });
});

describe("camadas, bloqueio e alinhamento", () => {
  it("trazer para frente muda a ordem e desfazer volta", () => {
    const { engine, cb } = setup();
    const [a, b] = [filled(0), filled(300)];
    engine.load([a, b]);
    click(engine, 50, 25);
    engine.bringToFront();
    expect(engine.elements.map((e) => e.id)).toEqual([b.id, a.id]);
    expect(cb.onChange).toHaveBeenCalledTimes(1);
    engine.undo();
    expect(engine.elements.map((e) => e.id)).toEqual([a.id, b.id]);
  });

  it("já está na frente: não gera passo de histórico", () => {
    const { engine, cb } = setup();
    engine.load([filled(0), filled(300)]);
    click(engine, 350, 25);
    engine.bringToFront();
    expect(cb.onChange).not.toHaveBeenCalled();
  });

  it("bloquear impede apagar; desbloquear libera", () => {
    const { engine } = setup();
    engine.load([filled(0)]);
    click(engine, 50, 25);
    engine.toggleLock();
    expect(engine.elements[0].locked).toBe(true);
    engine.deleteSelection();
    expect(engine.elements).toHaveLength(1);
    engine.toggleLock();
    expect(engine.elements[0].locked).toBe(false);
  });

  it("alinhar à esquerda leva todos ao menor x", () => {
    const { engine } = setup();
    engine.load([filled(40), filled(300, 100)]);
    engine.selectAll();
    engine.align("left");
    expect(engine.elements.map((e) => e.x)).toEqual([40, 40]);
  });

  it("getSelectionInfo resume a seleção para o menu", () => {
    const { engine } = setup();
    engine.load([filled(0), filled(300, 0, { locked: true })]);
    expect(engine.getSelectionInfo()).toEqual({ count: 0, hasGroup: false, allLocked: false, hasImage: false, hasCrop: false });
    engine.selectAll();
    expect(engine.getSelectionInfo()).toEqual({ count: 2, hasGroup: false, allLocked: false, hasImage: false, hasCrop: false });
    engine.group();
    expect(engine.getSelectionInfo().hasGroup).toBe(true);
  });
});

describe("girar", () => {
  it("arrastar a alça de girar gira em torno do centro", () => {
    const { engine, cb } = setup();
    engine.load([filled(0)]);
    click(engine, 50, 25); // seleciona; alça de girar fica em (50, -24)
    drag(engine, [50, -24], [150, 25]); // da vertical para a horizontal: +90°
    expect(engine.elements[0].angle).toBeCloseTo(Math.PI / 2);
    expect(cb.onChange).toHaveBeenCalledTimes(1);
  });

  it("shift trava o ângulo em passos de 15°", () => {
    const { engine } = setup();
    engine.load([filled(0)]);
    click(engine, 50, 25);
    // ponto a ~40° do início, em torno do centro (50,25)
    const r = 100;
    const a = -Math.PI / 2 + (40 * Math.PI) / 180;
    drag(engine, [50, -24], [50 + r * Math.cos(a), 25 + r * Math.sin(a)], { shift: true });
    const steps = engine.elements[0].angle / (Math.PI / 12);
    expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-9);
    expect(Math.round(steps)).toBe(3); // 45°
  });

  it("cancelar volta ao ângulo original", () => {
    const { engine, cb } = setup();
    engine.load([filled(0)]);
    click(engine, 50, 25);
    engine.pointerDown(pt(50, -24));
    engine.pointerMove(pt(150, 25));
    engine.pointerCancel();
    expect(engine.elements[0].angle).toBe(0);
    expect(cb.onChange).not.toHaveBeenCalled();
  });

  it("elemento girado continua selecionável e movível", () => {
    const { engine } = setup();
    engine.load([{ ...filled(0, 0, { width: 100, height: 20 }), angle: Math.PI / 2 }]);
    click(engine, 50, -30); // dentro da caixa girada
    expect(engine.selectedIds.size).toBe(1);
  });
});

describe("clique direito: selectAtPoint", () => {
  it("seleciona o elemento sob o cursor se ele não estava selecionado", () => {
    const { engine } = setup();
    const [a, b] = [filled(0), filled(300)];
    engine.load([a, b]);
    click(engine, 50, 25);
    engine.selectAtPoint({ x: 350, y: 25 });
    expect([...engine.selectedIds]).toEqual([b.id]);
  });

  it("mantém a seleção múltipla se o clique foi num elemento já selecionado", () => {
    const { engine } = setup();
    engine.load([filled(0), filled(300)]);
    engine.selectAll();
    engine.selectAtPoint({ x: 50, y: 25 });
    expect(engine.selectedIds.size).toBe(2);
  });

  it("no vazio limpa a seleção", () => {
    const { engine } = setup();
    engine.load([filled(0)]);
    click(engine, 50, 25);
    engine.selectAtPoint({ x: 900, y: 900 });
    expect(engine.selectedIds.size).toBe(0);
  });
});
