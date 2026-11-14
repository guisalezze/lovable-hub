import { describe, it, expect, vi } from "vitest";
import { WhiteboardEngine, type PointerInput } from "./engine";
import { createElement, parseScene, serializeScene } from "./scene";
import { hitTest } from "./geometry";
import { resolveShortcut } from "./shortcuts";
import { exportToSvg } from "./export";
import type { ThemeColors } from "./theme";

const pt = (x: number, y: number, extra: Partial<PointerInput> = {}): PointerInput => ({ x, y, shift: false, ctrl: false, button: 0, ...extra });

function setup() {
  const cb = { onChange: vi.fn(), onToolChange: vi.fn(), onSelectionChange: vi.fn(), onRequestRender: vi.fn(), onEditText: vi.fn() };
  return { engine: new WhiteboardEngine(cb), cb };
}

const textEl = (x = 0, y = 0, text = "Olá", extra = {}) =>
  createElement("text", x, y, { text, fontSize: 20, width: 100, height: 25, ...extra });

const click = (e: WhiteboardEngine, x: number, y: number) => {
  e.pointerDown(pt(x, y));
  e.pointerUp(pt(x, y));
};

describe("escrever texto novo", () => {
  it("com a ferramenta de texto, clicar começa a edição sem mexer no histórico", () => {
    const { engine, cb } = setup();
    engine.setTool("text");
    engine.pointerDown(pt(100, 50));
    engine.pointerUp(pt(100, 50));
    const el = engine.elements[0];
    expect(el).toMatchObject({ type: "text", x: 100, y: 50, text: "" });
    expect(engine.editingId).toBe(el.id);
    expect(cb.onEditText).toHaveBeenCalledWith(el.id);
    expect(cb.onChange).not.toHaveBeenCalled();
    expect(engine.canUndo).toBe(false);
  });

  it("confirmar cria o elemento medido, seleciona, volta à seleção e entra no histórico", () => {
    const { engine, cb } = setup();
    engine.setTool("text");
    click(engine, 100, 50);
    const id = engine.elements[0].id;
    engine.commitText(id, "Olá mundo");
    const el = engine.elements[0];
    expect(el.text).toBe("Olá mundo");
    expect(el.width).toBeGreaterThan(0);
    expect(el.height).toBeGreaterThan(0);
    expect(engine.editingId).toBeNull();
    expect(cb.onEditText).toHaveBeenLastCalledWith(null);
    expect(cb.onChange).toHaveBeenCalledTimes(1);
    expect(engine.tool).toBe("select");
    expect([...engine.selectedIds]).toEqual([id]);
    engine.undo();
    expect(engine.elements).toHaveLength(0);
  });

  it("texto novo deixado vazio some, sem histórico e sem aviso", () => {
    const { engine, cb } = setup();
    engine.setTool("text");
    click(engine, 10, 10);
    engine.commitText(engine.elements[0].id, "   \n ");
    expect(engine.elements).toHaveLength(0);
    expect(cb.onChange).not.toHaveBeenCalled();
    expect(engine.canUndo).toBe(false);
  });

  it("espaços e linhas em branco no fim são descartados", () => {
    const { engine } = setup();
    engine.setTool("text");
    click(engine, 0, 0);
    engine.commitText(engine.elements[0].id, "linha 1\nlinha 2  \n\n");
    expect(engine.elements[0].text).toBe("linha 1\nlinha 2");
  });

  it("enquanto edita, cliques no quadro são ignorados (o campo de texto termina a edição)", () => {
    const { engine } = setup();
    engine.setTool("text");
    click(engine, 10, 10);
    click(engine, 300, 300);
    expect(engine.elements).toHaveLength(1);
  });
});

describe("editar texto existente", () => {
  it("duplo clique no texto abre a edição; trocar o texto cria um passo de histórico", () => {
    const { engine, cb } = setup();
    const t = textEl(0, 0, "Olá");
    engine.load([t]);
    engine.doubleClick({ x: 50, y: 12 });
    expect(engine.editingId).toBe(t.id);
    expect(cb.onEditText).toHaveBeenCalledWith(t.id);
    engine.commitText(t.id, "Tchau");
    expect(engine.elements[0].text).toBe("Tchau");
    expect(cb.onChange).toHaveBeenCalledTimes(1);
    engine.undo();
    expect(engine.elements[0].text).toBe("Olá");
  });

  it("confirmar sem mudar nada não cria passo de histórico", () => {
    const { engine, cb } = setup();
    const t = textEl(0, 0, "Olá");
    engine.load([t]);
    engine.doubleClick({ x: 50, y: 12 });
    engine.commitText(t.id, "Olá");
    expect(cb.onChange).not.toHaveBeenCalled();
  });

  it("apagar todo o texto de um elemento que já existia remove o elemento, e desfazer traz de volta", () => {
    const { engine, cb } = setup();
    const t = textEl(0, 0, "Olá");
    engine.load([t]);
    engine.doubleClick({ x: 50, y: 12 });
    engine.commitText(t.id, "");
    expect(engine.elements).toHaveLength(0);
    expect(cb.onChange).toHaveBeenCalledTimes(1);
    engine.undo();
    expect(engine.elements[0].text).toBe("Olá");
  });

  it("duplo clique no vazio cria um texto novo ali", () => {
    const { engine } = setup();
    engine.doubleClick({ x: 200, y: 120 });
    expect(engine.elements[0]).toMatchObject({ type: "text", x: 200, y: 120 });
    expect(engine.editingId).toBe(engine.elements[0].id);
  });

  it("duplo clique numa forma abre o texto DELA (texto dentro da forma), sem criar outro elemento", () => {
    const { engine } = setup();
    const rect = createElement("rectangle", 0, 0, { width: 100, height: 50, backgroundColor: "#fff" });
    engine.load([rect]);
    engine.doubleClick({ x: 50, y: 25 });
    expect(engine.editingId).toBe(rect.id);
    expect(engine.elements).toHaveLength(1);
  });

  it("duplo clique no meio de uma forma sem preenchimento também edita o texto dela", () => {
    const { engine } = setup();
    const rect = createElement("rectangle", 0, 0, { width: 300, height: 200 }); // só a borda "acerta"
    engine.load([rect]);
    engine.doubleClick({ x: 150, y: 100 });
    expect(engine.editingId).toBe(rect.id);
  });
});

describe("texto como elemento", () => {
  it("clicar dentro da caixa do texto seleciona", () => {
    const { engine } = setup();
    const t = textEl(0, 0);
    engine.load([t]);
    click(engine, 50, 12);
    expect([...engine.selectedIds]).toEqual([t.id]);
  });

  it("hitTest: dentro da caixa acerta, longe não", () => {
    const t = textEl(0, 0);
    expect(hitTest(t, { x: 50, y: 12 }, 4)).toBe(true);
    expect(hitTest(t, { x: 300, y: 300 }, 4)).toBe(false);
  });

  it("tamanho da fonte pelo painel: aplica em quem tem texto, remede o texto solto e ignora seta", () => {
    const { engine } = setup();
    engine.load([textEl(0, 0, "Olá"), createElement("arrow", 200, 0, { points: [[0, 0], [50, 0]] })]);
    engine.selectAll();
    engine.applyStyle({ fontSize: 40 });
    expect(engine.elements[0].fontSize).toBe(40);
    expect(engine.elements[0].height).toBeCloseTo(40 * 1.25);
    expect(engine.elements[1].fontSize).toBeUndefined();
  });

  it("estilo da seleção mostra o tamanho da fonte dos textos", () => {
    const { engine } = setup();
    engine.load([textEl(0, 0, "a", { fontSize: 24 }), textEl(200, 0, "b", { fontSize: 24 })]);
    engine.selectAll();
    expect(engine.getStyleOfSelection().fontSize).toBe(24);
    engine.load([textEl(0, 0, "a", { fontSize: 24 }), textEl(200, 0, "b", { fontSize: 36 })]);
    engine.selectAll();
    expect(engine.getStyleOfSelection().fontSize).toBeUndefined();
  });

  it("o tamanho padrão da próxima escrita vem do painel", () => {
    const { engine } = setup();
    engine.applyStyle({ fontSize: 56 });
    engine.setTool("text");
    click(engine, 0, 0);
    expect(engine.elements[0].fontSize).toBe(56);
  });

  it("redimensionar pela alça escala a fonte", () => {
    const { engine } = setup();
    const t = textEl(0, 0, "Olá", { fontSize: 20, width: 100, height: 25 });
    engine.load([t]);
    click(engine, 50, 12);
    engine.pointerDown(pt(100, 25)); // alça sudeste
    engine.pointerMove(pt(200, 50));
    engine.pointerUp(pt(200, 50));
    expect(engine.elements[0].fontSize).toBe(40);
  });

  it("a fonte nunca fica menor que 8 ao encolher", () => {
    const { engine } = setup();
    engine.load([textEl(0, 0, "Olá", { fontSize: 20, width: 100, height: 25 })]);
    click(engine, 50, 12);
    engine.pointerDown(pt(100, 25));
    engine.pointerMove(pt(2, 1));
    engine.pointerUp(pt(2, 1));
    expect(engine.elements[0].fontSize).toBeGreaterThanOrEqual(8);
  });
});

describe("cena com texto", () => {
  it("serializa e lê de volta", () => {
    const els = [textEl(1, 2, "Oi\ntudo bem")];
    expect(parseScene(serializeScene(els))).toEqual({ ok: true, elements: els });
  });

  it("recusa texto com campo de tipo errado", () => {
    const bad = { ...textEl(), text: 42 };
    expect(parseScene({ version: 1, elements: [bad] }).ok).toBe(false);
    const bad2 = { ...textEl(), fontSize: "grande" };
    expect(parseScene({ version: 1, elements: [bad2] }).ok).toBe(false);
  });
});

describe("atalho", () => {
  const key = (k: string) => ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, target: document.body as EventTarget | null });
  it("T e 8 escolhem a ferramenta de texto", () => {
    expect(resolveShortcut(key("t"))).toEqual({ kind: "tool", tool: "text" });
    expect(resolveShortcut(key("8"))).toEqual({ kind: "tool", tool: "text" });
  });
});

describe("exportar texto", () => {
  const theme: ThemeColors = { background: "hsl(0 0% 4%)", foreground: "hsl(60 20% 95%)", grid: "hsl(0 0% 15%)", selection: "hsl(46 65% 52%)" };

  it("o SVG leva o texto, linha por linha, com a cor resolvida", () => {
    const svg = exportToSvg([textEl(10, 10, "Olá\nmundo", { strokeColor: "auto" })], { theme, background: false });
    expect(svg).toContain("<text");
    expect(svg).toContain("Olá");
    expect(svg).toContain("mundo");
    expect(svg).toContain(`fill="${theme.foreground}"`);
    expect(new DOMParser().parseFromString(svg, "image/svg+xml").querySelector("parsererror")).toBeNull();
  });

  it("caracteres especiais saem escapados e o SVG continua válido", () => {
    const svg = exportToSvg([textEl(0, 0, "a < b & c > d")], { theme, background: false });
    expect(new DOMParser().parseFromString(svg, "image/svg+xml").querySelector("parsererror")).toBeNull();
    expect(svg).toContain("a &lt; b &amp; c &gt; d");
  });
});
