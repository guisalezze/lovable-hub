import { describe, it, expect, vi } from "vitest";
import { WhiteboardEngine, type PointerInput } from "./engine";
import { createElement, parseScene, serializeScene } from "./scene";
import { exportToSvg } from "./export";
import { resolveShortcut } from "./shortcuts";
import { findBindTarget } from "./binding";
import type { WbElement } from "./types";

const pt = (x: number, y: number): PointerInput => ({ x, y, shift: false, ctrl: false, button: 0 });

function setup(elements: WbElement[] = []) {
  const cb = { onChange: vi.fn(), onToolChange: vi.fn(), onSelectionChange: vi.fn(), onRequestRender: vi.fn(), onEditText: vi.fn() };
  const engine = new WhiteboardEngine(cb);
  engine.load(elements);
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
const filled = (type: "rectangle" | "ellipse", x = 0, y = 0, extra = {}) =>
  createElement(type, x, y, { width: 200, height: 100, backgroundColor: "#ffffff", ...extra });

describe("texto com estilo", () => {
  it("confirmar guarda os trechos, o texto simples e mede pelo texto", () => {
    const { engine, cb } = setup();
    engine.setTool("text");
    click(engine, 10, 10);
    const id = engine.elements[0].id;
    engine.commitRuns(id, [{ text: "Olá " }, { text: "mundo", bold: true }]);
    const el = engine.elements[0];
    expect(el.runs).toEqual([{ text: "Olá " }, { text: "mundo", bold: true }]);
    expect(el.text).toBe("Olá mundo");
    expect(el.width).toBeGreaterThan(0);
    expect(cb.onChange).toHaveBeenCalledTimes(1);
  });

  it("espaços e quebras no fim são descartados", () => {
    const { engine } = setup();
    engine.setTool("text");
    click(engine, 0, 0);
    engine.commitRuns(engine.elements[0].id, [{ text: "a\n\n  ", bold: true }]);
    expect(engine.elements[0].text).toBe("a");
    expect(engine.elements[0].runs).toEqual([{ text: "a", bold: true }]);
  });

  it("só mudar o estilo (mesmo texto) já é uma alteração com passo de histórico", () => {
    const t = createElement("text", 0, 0, { text: "ola", runs: [{ text: "ola" }], fontSize: 20, width: 40, height: 25 });
    const { engine, cb } = setup([t]);
    engine.doubleClick({ x: 10, y: 10 });
    engine.commitRuns(t.id, [{ text: "ola", italic: true }]);
    expect(engine.elements[0].runs).toEqual([{ text: "ola", italic: true }]);
    expect(cb.onChange).toHaveBeenCalledTimes(1);
    engine.undo();
    expect(engine.elements[0].runs).toEqual([{ text: "ola" }]);
  });

  it("confirmar exatamente o que já estava não cria passo", () => {
    const t = createElement("text", 0, 0, { text: "ola", runs: [{ text: "ola" }], fontSize: 20, width: 40, height: 25 });
    const { engine, cb } = setup([t]);
    engine.doubleClick({ x: 10, y: 10 });
    engine.commitRuns(t.id, [{ text: "ola" }]);
    expect(cb.onChange).not.toHaveBeenCalled();
  });

  it("estilo da letra e alinhamento enquanto escreve valem para o texto, sem histórico até confirmar", () => {
    const { engine, cb } = setup();
    engine.setTool("text");
    click(engine, 0, 0);
    const id = engine.elements[0].id;
    engine.updateEditing({ fontSize: 36, fontFamily: "serif", textAlign: "center" });
    expect(cb.onChange).not.toHaveBeenCalled();
    expect(engine.getEditingElement()).toMatchObject({ fontSize: 36, fontFamily: "serif", textAlign: "center" });
    engine.commitRuns(id, [{ text: "oi" }]);
    expect(engine.elements[0]).toMatchObject({ fontSize: 36, fontFamily: "serif", textAlign: "center" });
    expect(engine.elements[0].height).toBeCloseTo(36 * 1.25);
  });

  it("fonte e alinhamento pelo painel valem para texto, nota e formas selecionados", () => {
    const t = createElement("text", 0, 0, { text: "a", fontSize: 20, width: 20, height: 25 });
    const r = filled("rectangle", 300, 0);
    const arrow = createElement("arrow", 0, 300, { points: [[0, 0], [50, 0]] });
    const { engine } = setup([t, r, arrow]);
    engine.selectAll();
    engine.applyStyle({ fontFamily: "mono", textAlign: "right" });
    expect(engine.elements[0]).toMatchObject({ fontFamily: "mono", textAlign: "right" });
    expect(engine.elements[1]).toMatchObject({ fontFamily: "mono", textAlign: "right" });
    expect(engine.elements[2].fontFamily).toBeUndefined(); // seta não tem texto
  });
});

describe("texto dentro de formas", () => {
  it("duplo clique numa forma abre a edição do texto dela", () => {
    const r = filled("rectangle");
    const { engine, cb } = setup([r]);
    engine.doubleClick({ x: 100, y: 50 });
    expect(engine.editingId).toBe(r.id);
    expect(cb.onEditText).toHaveBeenCalledWith(r.id);
  });

  it("confirmar põe o texto na forma sem mudar o tamanho dela", () => {
    const r = filled("rectangle");
    const { engine, cb } = setup([r]);
    engine.doubleClick({ x: 100, y: 50 });
    engine.commitRuns(r.id, [{ text: "Etapa 1" }]);
    expect(engine.elements[0]).toMatchObject({ text: "Etapa 1", width: 200, height: 100 });
    expect(cb.onChange).toHaveBeenCalledTimes(1);
  });

  it("esvaziar o texto de uma forma NÃO apaga a forma", () => {
    const r = filled("ellipse", 0, 0, { text: "x", runs: [{ text: "x" }] });
    const { engine } = setup([r]);
    engine.doubleClick({ x: 100, y: 50 });
    engine.commitRuns(r.id, []);
    expect(engine.elements).toHaveLength(1);
    expect(engine.elements[0].text).toBeUndefined();
    expect(engine.elements[0].runs).toBeUndefined();
  });

  it("forma vazia confirmada vazia não cria passo de histórico", () => {
    const r = filled("rectangle");
    const { engine, cb } = setup([r]);
    engine.doubleClick({ x: 100, y: 50 });
    engine.commitRuns(r.id, []);
    expect(cb.onChange).not.toHaveBeenCalled();
  });

  it("a seta presa continua presa a uma forma com texto", () => {
    const r = filled("rectangle");
    expect(findBindTarget([r], { x: 100, y: 50 }, 8, new Set())?.id).toBe(r.id);
  });

  it("linha e seta não abrem edição de texto", () => {
    const line = createElement("line", 0, 0, { points: [[0, 0], [100, 0]] });
    const { engine } = setup([line]);
    engine.doubleClick({ x: 50, y: 0 });
    expect(engine.editingId).toBeNull();
  });
});

describe("notas autoadesivas", () => {
  it("clicar com a ferramenta de nota cria uma nota amarela de tamanho padrão e abre a edição", () => {
    const { engine, cb } = setup();
    engine.setTool("note");
    click(engine, 100, 100);
    const note = engine.elements[0];
    expect(note).toMatchObject({ type: "note", x: 100, y: 100, width: 180, height: 140 });
    expect(note.backgroundColor).not.toBe("transparent");
    expect(engine.editingId).toBe(note.id);
    expect(cb.onEditText).toHaveBeenCalledWith(note.id);
    expect(engine.tool).toBe("select");
  });

  it("arrastar cria a nota no tamanho desenhado", () => {
    const { engine } = setup();
    engine.setTool("note");
    drag(engine, [100, 100], [400, 300]);
    expect(engine.elements[0]).toMatchObject({ type: "note", x: 100, y: 100, width: 300, height: 200 });
  });

  it("a nota entra no histórico ao ser criada", () => {
    const { engine } = setup();
    engine.setTool("note");
    click(engine, 0, 0);
    engine.commitRuns(engine.editingId!, []);
    expect(engine.elements).toHaveLength(1); // nota vazia continua existindo
    engine.undo();
    expect(engine.elements).toHaveLength(0);
  });

  it("escrever muito faz a nota crescer para baixo", () => {
    const { engine } = setup();
    engine.setTool("note");
    click(engine, 0, 0);
    const id = engine.editingId!;
    engine.commitRuns(id, [{ text: "palavra ".repeat(80) }]);
    expect(engine.elements[0].height).toBeGreaterThan(140);
  });

  it("o texto da nota é escuro, para ler sobre a cor de qualquer tema", () => {
    const { engine } = setup();
    engine.setTool("note");
    click(engine, 0, 0);
    expect(engine.elements[0].strokeColor).not.toBe("auto");
  });

  it("cor da nota pelo painel de fundo", () => {
    const { engine } = setup();
    engine.setTool("note");
    click(engine, 0, 0);
    engine.commitRuns(engine.editingId!, [{ text: "x" }]);
    engine.applyStyle({ backgroundColor: "#8ce99a" });
    expect(engine.elements[0].backgroundColor).toBe("#8ce99a");
  });

  it("nota se seleciona e se move como qualquer elemento", () => {
    const { engine } = setup();
    engine.setTool("note");
    click(engine, 0, 0);
    engine.commitRuns(engine.editingId!, [{ text: "x" }]);
    drag(engine, [90, 70], [190, 120]);
    expect(engine.elements[0].x).toBeCloseTo(100);
    expect(engine.elements[0].y).toBeCloseTo(50);
  });

  it("nota recebe seta presa", () => {
    const { engine } = setup();
    engine.setTool("note");
    click(engine, 0, 0);
    engine.commitRuns(engine.editingId!, [{ text: "x" }]);
    const note = engine.elements[0];
    engine.setTool("arrow");
    drag(engine, [600, 70], [90, 70]); // termina dentro da nota
    expect(engine.elements.find((e) => e.type === "arrow")!.bindings).toEqual({ end: note.id });
  });
});

describe("cena e exportação", () => {
  it("serializa e lê de volta texto com estilo, alinhamento, fonte e nota", () => {
    const els = [
      createElement("text", 0, 0, { text: "ab", runs: [{ text: "a" }, { text: "b", bold: true, highlight: "#ffd43b" }], fontSize: 20, fontFamily: "serif", textAlign: "center" }),
      createElement("note", 0, 100, { width: 180, height: 140, text: "x", runs: [{ text: "x" }] }),
    ];
    expect(parseScene(serializeScene(els))).toEqual({ ok: true, elements: els });
  });

  it("recusa estilo de texto com formato errado", () => {
    const base = createElement("text", 0, 0, { text: "a" });
    for (const bad of [
      { runs: "x" },
      { runs: [{ text: 5 }] },
      { runs: [{ text: "a", bold: "sim" }] },
      { runs: [{ text: "a", highlight: 3 }] },
      { textAlign: "justify" },
      { fontFamily: "comic" },
    ]) {
      expect(parseScene({ version: 1, elements: [{ ...base, ...bad }] }).ok).toBe(false);
    }
  });

  const theme = { background: "hsl(0 0% 4%)", foreground: "hsl(60 20% 95%)", grid: "hsl(0 0% 15%)", selection: "hsl(46 65% 52%)" };
  const parses = (svg: string) => new DOMParser().parseFromString(svg, "image/svg+xml").querySelector("parsererror") === null;

  it("SVG leva negrito, itálico, sublinhado, tachado e marca-texto", () => {
    const el = createElement("text", 0, 0, {
      text: "abcde",
      fontSize: 20,
      runs: [{ text: "a", bold: true }, { text: "b", italic: true }, { text: "c", underline: true }, { text: "d", strike: true }, { text: "e", highlight: "#ffd43b" }],
    });
    const svg = exportToSvg([el], { theme, background: false });
    expect(parses(svg)).toBe(true);
    expect(svg).toContain('font-weight="700"');
    expect(svg).toContain('font-style="italic"');
    expect(svg).toContain('text-decoration="underline"');
    expect(svg).toContain('text-decoration="line-through"');
    expect(svg).toContain("#ffd43b");
  });

  it("SVG leva o texto de uma forma e de uma nota", () => {
    const rect = filled("rectangle", 0, 0, { text: "Etapa", runs: [{ text: "Etapa" }], fontSize: 20 });
    const note = createElement("note", 300, 0, { width: 180, height: 140, text: "Lembrete", runs: [{ text: "Lembrete" }], backgroundColor: "#ffd43b", strokeColor: "#1e1e1e", fontSize: 20 });
    const svg = exportToSvg([rect, note], { theme, background: false });
    expect(parses(svg)).toBe(true);
    expect(svg).toContain("Etapa");
    expect(svg).toContain("Lembrete");
    expect(svg).toContain('fill="#ffd43b"'); // o papel da nota
  });

  it("lista aparece com o marcador no SVG", () => {
    const el = createElement("text", 0, 0, { text: "- um\n- dois", runs: [{ text: "- um\n- dois" }], fontSize: 20 });
    const svg = exportToSvg([el], { theme, background: false });
    expect(svg).toContain("•");
    expect(svg).not.toContain("- um");
  });
});

describe("atalho da nota", () => {
  const key = (k: string) => ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, target: document.body as EventTarget | null });
  it("N e 9 escolhem a nota", () => {
    expect(resolveShortcut(key("n"))).toEqual({ kind: "tool", tool: "note" });
    expect(resolveShortcut(key("9"))).toEqual({ kind: "tool", tool: "note" });
  });
});
