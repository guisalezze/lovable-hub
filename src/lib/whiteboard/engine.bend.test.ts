import { describe, it, expect, vi } from "vitest";
import { WhiteboardEngine, type PointerInput } from "./engine";
import { createElement } from "./scene";
import { exportToSvg } from "./export";

const pt = (x: number, y: number): PointerInput => ({ x, y, shift: false, ctrl: false, button: 0 });

function setup(extra = {}) {
  const cb = { onChange: vi.fn(), onToolChange: vi.fn(), onSelectionChange: vi.fn(), onRequestRender: vi.fn() };
  const engine = new WhiteboardEngine(cb);
  engine.load([createElement("arrow", 0, 0, { points: [[0, 0], [100, 0]], ...extra })]);
  return { engine, cb };
}

const click = (e: WhiteboardEngine, x: number, y: number) => {
  e.pointerDown(pt(x, y));
  e.pointerUp(pt(x, y));
};
const drag = (e: WhiteboardEngine, from: [number, number], to: [number, number]) => {
  e.pointerDown(pt(from[0], from[1]));
  e.pointerMove(pt(to[0], to[1]));
  e.pointerUp(pt(to[0], to[1]));
};

describe("curvar uma seta", () => {
  it("selecionar a seta e arrastar a bolinha do meio curva; a curva passa por onde soltou", () => {
    const { engine, cb } = setup();
    click(engine, 20, 0); // seleciona a seta
    drag(engine, [50, 0], [50, -40]);
    expect(engine.elements[0].bend).toEqual([50, -80]);
    expect(cb.onChange).toHaveBeenCalledTimes(1);
  });

  it("desfazer volta a seta reta; refazer curva de novo", () => {
    const { engine } = setup();
    click(engine, 20, 0);
    drag(engine, [50, 0], [50, -40]);
    engine.undo();
    expect(engine.elements[0].bend).toBeUndefined();
    engine.redo();
    expect(engine.elements[0].bend).toEqual([50, -80]);
  });

  it("levar a bolinha de volta perto da reta endireita a seta", () => {
    const { engine } = setup({ bend: [50, -80] });
    click(engine, 50, -40); // seleciona pela curva
    drag(engine, [50, -40], [50, 1]);
    expect(engine.elements[0].bend).toBeUndefined();
  });

  it("cancelar o gesto no meio devolve a curva de antes, sem avisar", () => {
    const { engine, cb } = setup();
    click(engine, 20, 0);
    engine.pointerDown(pt(50, 0));
    engine.pointerMove(pt(50, -60));
    engine.pointerCancel();
    expect(engine.elements[0].bend).toBeUndefined();
    expect(cb.onChange).not.toHaveBeenCalled();
  });

  it("só pegar a bolinha, sem arrastar, não muda nada nem cria histórico", () => {
    const { engine, cb } = setup();
    click(engine, 20, 0);
    click(engine, 50, 0);
    expect(engine.elements[0].bend).toBeUndefined();
    expect(cb.onChange).not.toHaveBeenCalled();
  });

  it("seta bloqueada não curva (e não se move)", () => {
    const { engine, cb } = setup({ locked: true });
    click(engine, 20, 0);
    drag(engine, [50, 0], [50, -40]);
    expect(engine.elements[0].bend).toBeUndefined();
    expect(cb.onChange).not.toHaveBeenCalled();
  });

  it("a bolinha só aparece com UM elemento selecionado", () => {
    const { engine } = setup();
    engine.load([
      createElement("arrow", 0, 0, { points: [[0, 0], [100, 0]] }),
      createElement("arrow", 0, 200, { points: [[0, 0], [100, 0]] }),
    ]);
    engine.selectAll();
    drag(engine, [50, 0], [50, -40]); // com dois selecionados isto move, não curva
    expect(engine.elements[0].bend).toBeUndefined();
    expect(engine.elements[0].y).toBeCloseTo(-40);
  });

  it("linha também curva", () => {
    const { engine } = setup();
    engine.load([createElement("line", 0, 0, { points: [[0, 0], [100, 0]] })]);
    click(engine, 20, 0);
    drag(engine, [50, 0], [50, 30]);
    expect(engine.elements[0].bend).toEqual([50, 60]);
  });
});

describe("seta curva em outras operações", () => {
  it("redimensionar escala a curva junto", () => {
    const { engine } = setup({ bend: [50, -80] }); // a curva sobe até y=-40
    click(engine, 0, 0); // a ponta da seta está sobre ela; (20,0) ficou abaixo da curva
    drag(engine, [100, 0], [200, 0]); // alça sudeste: dobra a largura, altura igual
    const el = engine.elements[0];
    expect(el.points).toEqual([[0, 0], [200, 0]]);
    expect(el.bend![0]).toBeCloseTo(100);
    expect(el.bend![1]).toBeCloseTo(-80);
  });

  it("duplicar mantém a curva", () => {
    const { engine } = setup({ bend: [50, -80] });
    click(engine, 0, 0);
    engine.duplicate();
    expect(engine.elements[1].bend).toEqual([50, -80]);
  });

  it("a curva sai no SVG como caminho curvo", () => {
    const theme = { background: "hsl(0 0% 4%)", foreground: "hsl(60 20% 95%)", grid: "hsl(0 0% 15%)", selection: "hsl(46 65% 52%)" };
    const el = createElement("arrow", 0, 0, { points: [[0, 0], [100, 0]], bend: [50, -80] });
    const svg = exportToSvg([el], { theme, background: false });
    expect(new DOMParser().parseFromString(svg, "image/svg+xml").querySelector("parsererror")).toBeNull();
    expect(svg).toMatch(/<path[^>]* d="[^"]*[CQ]/); // curva (rough converte Q em C), não só retas L
  });
});
