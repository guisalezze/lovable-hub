import { render, fireEvent, act, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RichTextEditor } from "./RichTextEditor";
import { createElement } from "@/lib/whiteboard/scene";
import type { WbElement } from "@/lib/whiteboard/types";

const theme = { background: "hsl(0 0% 4%)", foreground: "hsl(60 20% 95%)", grid: "hsl(0 0% 15%)", selection: "hsl(46 65% 52%)" };
const camera = { x: 0, y: 0, zoom: 1 };

function setup(element: WbElement = createElement("text", 100, 50, { text: "", fontSize: 24 })) {
  const onCommit = vi.fn();
  const onStyle = vi.fn();
  const utils = render(
    <div data-testid="root" tabIndex={0}>
      <RichTextEditor element={element} camera={camera} theme={theme} onCommit={onCommit} onStyle={onStyle} />
    </div>,
  );
  const editor = utils.getByLabelText("Texto do quadro") as HTMLDivElement;
  const root = utils.getByTestId("root");
  const type = (html: string) => {
    editor.innerHTML = html;
    fireEvent.input(editor);
  };
  return { onCommit, onStyle, editor, root, type, ...utils };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  delete (document as unknown as { execCommand?: unknown }).execCommand;
});

describe("RichTextEditor: foco e confirmação", () => {
  it("recebe o foco logo depois de abrir", () => {
    const { editor } = setup();
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(document.activeElement).toBe(editor);
  });

  it("o navegador devolver o foco ao quadro logo após o clique NÃO fecha o campo vazio", () => {
    const { editor, root, onCommit } = setup();
    act(() => {
      vi.advanceTimersByTime(0);
    });
    act(() => {
      root.focus();
    });
    expect(onCommit).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(document.activeElement).toBe(editor);
  });

  it("depois de escrever, perder o foco confirma com os trechos formatados", () => {
    const { root, onCommit, type } = setup();
    act(() => {
      vi.advanceTimersByTime(0);
    });
    type("Olá <b>mundo</b>");
    act(() => {
      root.focus();
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith([{ text: "Olá " }, { text: "mundo", bold: true }]);
  });

  it("clicar fora depois de um tempo, mesmo sem escrever, confirma (o motor descarta texto vazio)", () => {
    const { root, onCommit } = setup();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      root.focus();
    });
    expect(onCommit).toHaveBeenCalledWith([]);
  });

  it("Esc confirma uma vez só; espaços e quebras do fim são cortados", () => {
    const { editor, onCommit, type } = setup();
    act(() => {
      vi.advanceTimersByTime(0);
    });
    type("Oi<div><br></div><div><br></div>");
    fireEvent.keyDown(editor, { key: "Escape" });
    fireEvent.blur(editor);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith([{ text: "Oi" }]);
  });

  it("Ctrl+Enter confirma e Enter sozinho não", () => {
    const { editor, onCommit, type } = setup();
    act(() => {
      vi.advanceTimersByTime(0);
    });
    type("a");
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(editor, { key: "Enter", ctrlKey: true });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("abre com o texto e a formatação que já existiam", () => {
    const el = createElement("text", 0, 0, { text: "Olá mundo", runs: [{ text: "Olá " }, { text: "mundo", bold: true, italic: true }], fontSize: 24 });
    const { editor } = setup(el);
    expect(editor.querySelector("b i, i b")).not.toBeNull();
    expect(editor.textContent).toBe("Olá mundo");
  });

  it("colar traz só o texto simples", () => {
    const exec = vi.fn((..._args: unknown[]) => true);  
    (document as unknown as { execCommand: unknown }).execCommand = exec;
    const { editor } = setup();
    const data = { getData: (t: string) => (t === "text/plain" ? "só texto" : "<b>html</b>") };
    fireEvent.paste(editor, { clipboardData: data });
    expect(exec).toHaveBeenCalledWith("insertText", false, "só texto");
  });
});

describe("RichTextEditor: barra de formatação", () => {
  it("negrito, itálico, sublinhado e tachado usam os comandos do navegador", () => {
    const exec = vi.fn((..._args: unknown[]) => true);  
    (document as unknown as { execCommand: unknown }).execCommand = exec;
    setup();
    fireEvent.click(screen.getByLabelText("Negrito"));
    fireEvent.click(screen.getByLabelText("Itálico"));
    fireEvent.click(screen.getByLabelText("Sublinhado"));
    fireEvent.click(screen.getByLabelText("Tachado"));
    expect(exec.mock.calls.map((c) => c[0])).toEqual(["bold", "italic", "underline", "strikeThrough"]);
  });

  it("marca-texto aplica a cor amarela", () => {
    const exec = vi.fn((..._args: unknown[]) => true);  
    (document as unknown as { execCommand: unknown; queryCommandValue: unknown }).execCommand = exec;
    (document as unknown as { queryCommandValue: unknown }).queryCommandValue = () => "transparent";
    setup();
    fireEvent.click(screen.getByLabelText("Marca-texto"));
    expect(exec).toHaveBeenCalledWith("hiliteColor", false, "#ffd43b");
    delete (document as unknown as { queryCommandValue?: unknown }).queryCommandValue;
  });

  it("marca-texto de novo tira a cor", () => {
    const exec = vi.fn((..._args: unknown[]) => true);  
    (document as unknown as { execCommand: unknown }).execCommand = exec;
    (document as unknown as { queryCommandValue: unknown }).queryCommandValue = () => "rgb(255, 212, 59)";
    setup();
    fireEvent.click(screen.getByLabelText("Marca-texto"));
    expect(exec).toHaveBeenCalledWith("hiliteColor", false, "transparent");
    delete (document as unknown as { queryCommandValue?: unknown }).queryCommandValue;
  });

  it("fonte, alinhamento e tamanho vão para o elemento (onStyle)", () => {
    const { onStyle } = setup();
    fireEvent.click(screen.getByLabelText("Fonte Com serifa"));
    fireEvent.click(screen.getByLabelText("Centralizar"));
    fireEvent.click(screen.getByLabelText("Letra grande"));
    expect(onStyle).toHaveBeenNthCalledWith(1, { fontFamily: "serif" });
    expect(onStyle).toHaveBeenNthCalledWith(2, { textAlign: "center" });
    expect(onStyle).toHaveBeenNthCalledWith(3, { fontSize: 36 });
  });

  it("mostra qual fonte, alinhamento e tamanho estão valendo", () => {
    const el = createElement("text", 0, 0, { text: "", fontSize: 36, fontFamily: "mono", textAlign: "right" });
    setup(el);
    expect(screen.getByLabelText("Fonte Monoespaçada").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("Alinhar à direita").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("Letra grande").getAttribute("aria-pressed")).toBe("true");
  });

  it("clicar na barra não confirma o texto (o foco vai para a barra)", () => {
    const { editor, onCommit } = setup();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const button = screen.getByLabelText("Centralizar");
    fireEvent.blur(editor, { relatedTarget: button });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("sem suporte a execCommand os botões não quebram", () => {
    setup();
    expect(() => fireEvent.click(screen.getByLabelText("Negrito"))).not.toThrow();
  });
});

describe("RichTextEditor: dentro de formas e notas", () => {
  it("texto de uma forma fica centrado", () => {
    const el = createElement("rectangle", 0, 0, { width: 200, height: 100, fontSize: 20 });
    const { editor } = setup(el);
    expect(editor.style.textAlign).toBe("center");
  });

  it("texto de uma nota começa à esquerda", () => {
    const el = createElement("note", 0, 0, { width: 180, height: 140, fontSize: 20 });
    const { editor } = setup(el);
    expect(editor.style.textAlign).toBe("left");
  });

  it("texto solto não quebra sozinho; o de forma e nota quebra na largura", () => {
    const free = setup(createElement("text", 0, 0, { text: "", fontSize: 20 }));
    expect(free.editor.style.whiteSpace).toBe("pre");
    free.unmount();
    const note = setup(createElement("note", 0, 0, { width: 180, height: 140, fontSize: 20 }));
    expect(note.editor.style.whiteSpace).toBe("pre-wrap");
  });
});
