import { describe, it, expect, vi } from "vitest";
import { WhiteboardEngine, type PointerInput } from "./engine";
import { createElement } from "./scene";
import { endpointHandles, selectionFrame } from "./geometry";
import { moveEndpoint } from "./binding";
import type { WbElement } from "./types";

const pt = (x: number, y: number, extra: Partial<PointerInput> = {}): PointerInput => ({ x, y, shift: false, ctrl: false, button: 0, ...extra });

function setup(elements: WbElement[] = []) {
  const cb = { onChange: vi.fn(), onToolChange: vi.fn(), onSelectionChange: vi.fn(), onRequestRender: vi.fn() };
  const engine = new WhiteboardEngine(cb);
  engine.load(elements);
  return { engine, cb };
}

const box = (x: number, y: number, w = 100, h = 50) => createElement("rectangle", x, y, { width: w, height: h, backgroundColor: "#ffffff" });
const click = (e: WhiteboardEngine, x: number, y: number) => {
  e.pointerDown(pt(x, y));
  e.pointerUp(pt(x, y));
};
const drag = (e: WhiteboardEngine, from: [number, number], to: [number, number], extra: Partial<PointerInput> = {}) => {
  e.pointerDown(pt(from[0], from[1], extra));
  e.pointerMove(pt(to[0], to[1], extra));
  e.pointerUp(pt(to[0], to[1], extra));
};
const endOf = (el: WbElement) => ({ x: el.x + el.points![1][0], y: el.y + el.points![1][1] });
const startOf = (el: WbElement) => ({ x: el.x + el.points![0][0], y: el.y + el.points![0][1] });
const arrowOf = (e: WhiteboardEngine) => e.elements.find((x) => x.type === "arrow")!;

describe("criar uma seta entre duas formas", () => {
  it("prende as duas pontas, que ficam coladas nas bordas", () => {
    const A = box(0, 0);
    const B = box(300, 0);
    const { engine } = setup([A, B]);
    engine.setTool("arrow");
    drag(engine, [50, 25], [350, 25]);
    const arrow = arrowOf(engine);
    expect(arrow.bindings).toEqual({ start: A.id, end: B.id });
    expect(startOf(arrow).x).toBeCloseTo(102, 0); // borda direita de A (100) + folga
    expect(endOf(arrow).x).toBeCloseTo(298, 0); // borda esquerda de B (300) - folga
  });

  it("começando no vazio e terminando numa forma, prende só o fim", () => {
    const B = box(300, 0);
    const { engine } = setup([B]);
    engine.setTool("arrow");
    drag(engine, [100, 200], [350, 25]);
    expect(arrowOf(engine).bindings).toEqual({ end: B.id });
  });

  it("entre o vazio e o vazio, não prende nada", () => {
    const { engine } = setup([box(0, 0)]);
    engine.setTool("arrow");
    drag(engine, [200, 200], [400, 300]);
    expect(arrowOf(engine).bindings).toBeUndefined();
  });

  it("começar e terminar na mesma forma não prende (seta degenerada)", () => {
    const A = box(0, 0);
    const { engine } = setup([A]);
    engine.setTool("arrow");
    drag(engine, [10, 10], [90, 40]);
    expect(arrowOf(engine).bindings).toBeUndefined();
  });

  it("linha não prende (só seta)", () => {
    const { engine } = setup([box(0, 0), box(300, 0)]);
    engine.setTool("line");
    drag(engine, [50, 25], [350, 25]);
    expect(engine.elements.find((e) => e.type === "line")!.bindings).toBeUndefined();
  });

  it("enquanto desenha, a forma sob a ponta fica em destaque", () => {
    const B = box(300, 0);
    const { engine } = setup([B]);
    engine.setTool("arrow");
    engine.pointerDown(pt(100, 200));
    engine.pointerMove(pt(350, 25));
    expect(engine.bindHighlightId).toBe(B.id);
    engine.pointerMove(pt(700, 400));
    expect(engine.bindHighlightId).toBeNull();
    engine.pointerUp(pt(700, 400));
    expect(engine.bindHighlightId).toBeNull();
  });
});

describe("a seta acompanha as formas", () => {
  function withArrow() {
    const A = box(0, 0);
    const B = box(300, 0);
    const s = setup([A, B]);
    s.engine.setTool("arrow");
    drag(s.engine, [50, 25], [350, 25]);
    s.cb.onChange.mockClear();
    return { ...s, A, B };
  }

  it("mover a forma leva a ponta junto, ao vivo e no fim", () => {
    const { engine, B } = withArrow();
    click(engine, 350, 25);
    engine.pointerDown(pt(350, 25));
    engine.pointerMove(pt(350, 125)); // B desce 100
    expect(endOf(arrowOf(engine)).y).toBeGreaterThan(40); // ao vivo: a ponta já desceu
    engine.pointerUp(pt(350, 125));
    const end = endOf(arrowOf(engine));
    expect(end.y).toBeGreaterThan(40);
    expect(end.x).toBeGreaterThan(280);
    expect(end.x).toBeLessThan(310);
    expect(arrowOf(engine).bindings?.end).toBe(B.id);
  });

  it("desfazer o movimento devolve a seta junto com a forma", () => {
    const { engine } = withArrow();
    const before = endOf(arrowOf(engine));
    click(engine, 350, 25);
    drag(engine, [350, 25], [350, 125]);
    engine.undo();
    const after = endOf(arrowOf(engine));
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("arrastar só a seta solta as pontas", () => {
    const { engine } = withArrow();
    drag(engine, [150, 25], [150, 125]); // pega a seta longe do meio (o meio é a bolinha de curvar)
    expect(arrowOf(engine).bindings).toBeUndefined();
  });

  it("mover a seta junto com as formas mantém tudo preso", () => {
    const { engine, A, B } = withArrow();
    engine.selectAll();
    drag(engine, [50, 25], [80, 85]);
    expect(arrowOf(engine).bindings).toEqual({ start: A.id, end: B.id });
  });

  it("apagar a forma solta a ponta e a seta fica onde estava", () => {
    const { engine, A } = withArrow();
    const endBefore = endOf(arrowOf(engine));
    engine.clearSelection();
    click(engine, 350, 25); // seleciona B
    engine.deleteSelection();
    const arrow = arrowOf(engine);
    expect(arrow.bindings).toEqual({ start: A.id });
    expect(endOf(arrow).x).toBeCloseTo(endBefore.x);
  });

  it("redimensionar a forma também move a ponta", () => {
    const { engine } = withArrow();
    click(engine, 350, 25);
    const endBefore = endOf(arrowOf(engine));
    engine.pointerDown(pt(300, 0)); // alça noroeste de B: encolhe pelo canto
    engine.pointerMove(pt(340, 0));
    engine.pointerUp(pt(340, 0));
    expect(endOf(arrowOf(engine)).x).toBeGreaterThan(endBefore.x + 20);
  });
});

describe("arrastar a ponta de uma seta", () => {
  function selectedArrow() {
    const A = box(0, 0);
    const B = box(300, 0);
    const C = box(600, 200);
    const s = setup([A, B, C]);
    s.engine.setTool("arrow");
    drag(s.engine, [50, 25], [350, 25]);
    s.engine.clearSelection();
    click(s.engine, 200, 25); // seleciona a seta pelo meio
    s.cb.onChange.mockClear();
    return { ...s, A, B, C };
  }

  it("seta de 2 pontos mostra as alças das pontas e nenhuma alça de tamanho", () => {
    const { engine } = selectedArrow();
    const arrow = arrowOf(engine);
    const frame = selectionFrame([arrow], 1)!;
    expect(frame.handles).toEqual([]);
    expect(endpointHandles(arrow)).toMatchObject({ start: expect.any(Object), end: expect.any(Object) });
  });

  it("levar a ponta para outra forma prende nela", () => {
    const { engine, A, C } = selectedArrow();
    const end = endOf(arrowOf(engine));
    drag(engine, [end.x, end.y], [650, 225]);
    expect(arrowOf(engine).bindings).toEqual({ start: A.id, end: C.id });
  });

  it("levar a ponta para o vazio solta e a ponta fica onde parou", () => {
    const { engine, A } = selectedArrow();
    const end = endOf(arrowOf(engine));
    drag(engine, [end.x, end.y], [500, 400]);
    const arrow = arrowOf(engine);
    expect(arrow.bindings).toEqual({ start: A.id });
    expect(endOf(arrow).x).toBeCloseTo(500);
    expect(endOf(arrow).y).toBeCloseTo(400);
  });

  it("desfazer volta a ponta e a ligação", () => {
    const { engine, A, B } = selectedArrow();
    const end = endOf(arrowOf(engine));
    drag(engine, [end.x, end.y], [500, 400]);
    engine.undo();
    expect(arrowOf(engine).bindings).toEqual({ start: A.id, end: B.id });
  });

  it("cancelar no meio devolve tudo, sem avisar", () => {
    const { engine, cb, A, B } = selectedArrow();
    const end = endOf(arrowOf(engine));
    engine.pointerDown(pt(end.x, end.y));
    engine.pointerMove(pt(500, 400));
    engine.pointerCancel();
    expect(arrowOf(engine).bindings).toEqual({ start: A.id, end: B.id });
    expect(cb.onChange).not.toHaveBeenCalled();
  });

  it("só pegar a ponta sem arrastar não muda nada", () => {
    const { engine, cb } = selectedArrow();
    const end = endOf(arrowOf(engine));
    click(engine, end.x, end.y);
    expect(cb.onChange).not.toHaveBeenCalled();
  });

  it("seta bloqueada não tem alças de ponta", () => {
    const { engine, cb } = selectedArrow();
    engine.toggleLock();
    cb.onChange.mockClear();
    const end = endOf(arrowOf(engine));
    drag(engine, [end.x, end.y], [500, 400]);
    expect(cb.onChange).not.toHaveBeenCalled();
  });
});

describe("moveEndpoint (função pura)", () => {
  const A = box(0, 0);
  const B = box(300, 0);
  const C = box(600, 0);
  const byId = new Map([A, B, C].map((e) => [e.id, e]));
  const arrow = () => createElement("arrow", 102, 25, { points: [[0, 0], [196, 0]], bindings: { start: A.id, end: B.id } });

  it("com alvo: prende nele e encosta na borda", () => {
    const out = moveEndpoint(arrow(), "end", { x: 650, y: 25 }, C, byId);
    expect(out.bindings).toEqual({ start: A.id, end: C.id });
    expect(out.x + out.points![1][0]).toBeCloseTo(598, 0);
  });

  it("sem alvo: solta a ponta e ela fica exatamente onde foi solta", () => {
    const out = moveEndpoint(arrow(), "end", { x: 500, y: 300 }, null, byId);
    expect(out.bindings).toEqual({ start: A.id });
    expect(out.x + out.points![1][0]).toBeCloseTo(500);
    expect(out.y + out.points![1][1]).toBeCloseTo(300);
  });

  it("soltar o começo faz a outra ponta presa se reorientar para ele", () => {
    const out = moveEndpoint(arrow(), "start", { x: 350, y: 400 }, null, byId);
    expect(out.bindings).toEqual({ end: B.id });
    expect(out.x).toBeCloseTo(350);
    expect(out.y).toBeCloseTo(400);
    // o fim agora sai da borda de baixo de B, na direção do começo
    const end = { x: out.x + out.points![1][0], y: out.y + out.points![1][1] };
    expect(end.y).toBeGreaterThan(50);
    expect(end.y).toBeLessThan(60);
  });

  it("mantém a curva com o mesmo afastamento da corda", () => {
    const curved = { ...arrow(), bend: [98, -60] as [number, number] };
    const out = moveEndpoint(curved, "end", { x: 500, y: 300 }, null, byId);
    const a = { x: out.x, y: out.y };
    const b = { x: out.x + out.points![1][0], y: out.y + out.points![1][1] };
    const control = { x: out.x + out.bend![0], y: out.y + out.bend![1] };
    expect(control.x - (a.x + b.x) / 2).toBeCloseTo(0, 0);
    expect(control.y - (a.y + b.y) / 2).toBeCloseTo(-60, 0);
  });
});

describe("alinhamento automático ao mover", () => {
  function two() {
    const A = box(0, 0);
    const B = box(200, 300);
    const s = setup([A, B]);
    click(s.engine, 250, 325); // seleciona B
    s.cb.onChange.mockClear();
    return { ...s, A, B };
  }

  it("encaixa a borda de B na de A quando chega perto, e mostra a guia durante o arrasto", () => {
    const { engine } = two();
    engine.pointerDown(pt(250, 325));
    engine.pointerMove(pt(53, 325)); // B.x = 3: fica a 3 da borda esquerda de A
    expect(engine.elements[1].x).toBe(0);
    expect(engine.guides.some((g) => g.axis === "x" && g.pos === 0)).toBe(true);
    engine.pointerUp(pt(53, 325));
    expect(engine.elements[1].x).toBe(0);
    expect(engine.guides).toEqual([]);
  });

  it("Ctrl solta o alinhamento", () => {
    const { engine } = two();
    drag(engine, [250, 325], [53, 325], { ctrl: true });
    expect(engine.elements[1].x).toBe(3);
  });

  it("longe, não encaixa", () => {
    const { engine } = two();
    drag(engine, [250, 325], [150, 325]); // x = 100
    expect(engine.elements[1].x).toBe(100);
  });

  it("a folga acompanha o zoom (6 pixels de tela, não do mundo)", () => {
    const { engine } = two();
    engine.camera = { x: 0, y: 0, zoom: 4 };
    // com zoom 4, 3 unidades do mundo = 12 pixels de tela: acima do limite, não encaixa
    engine.pointerDown(pt(250 * 4, 325 * 4));
    engine.pointerMove(pt(53 * 4, 325 * 4));
    expect(engine.elements[1].x).toBeCloseTo(3);
    engine.pointerUp(pt(53 * 4, 325 * 4));
  });

  it("cancelar o gesto limpa as guias", () => {
    const { engine } = two();
    engine.pointerDown(pt(250, 325));
    engine.pointerMove(pt(53, 325));
    engine.pointerCancel();
    expect(engine.guides).toEqual([]);
  });
});
