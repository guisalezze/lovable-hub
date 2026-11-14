import { render, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TextEditor } from "./TextEditor";
import { createElement } from "@/lib/whiteboard/scene";

const theme = { background: "hsl(0 0% 4%)", foreground: "hsl(60 20% 95%)", grid: "hsl(0 0% 15%)", selection: "hsl(46 65% 52%)" };
const camera = { x: 0, y: 0, zoom: 1 };

function setup() {
  const onCommit = vi.fn();
  const element = createElement("text", 100, 50, { text: "", fontSize: 24 });
  const utils = render(
    <div data-testid="root" tabIndex={0}>
      <TextEditor element={element} camera={camera} theme={theme} onCommit={onCommit} />
    </div>,
  );
  const textarea = utils.getByLabelText("Texto do quadro") as HTMLTextAreaElement;
  const root = utils.getByTestId("root");
  return { onCommit, textarea, root };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("TextEditor", () => {
  it("recebe o foco logo depois de abrir", () => {
    const { textarea } = setup();
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(document.activeElement).toBe(textarea);
  });

  it("o navegador devolver o foco ao quadro logo após o clique NÃO fecha o campo vazio", () => {
    // Clicar no canvas: o navegador foca o quadro (ancestral com tabIndex) depois que o campo abriu.
    const { textarea, root, onCommit } = setup();
    act(() => {
      vi.advanceTimersByTime(0);
    });
    act(() => {
      root.focus(); // rouba o foco: o campo recebe blur
    });
    expect(onCommit).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(document.activeElement).toBe(textarea); // e o campo recupera o foco
  });

  it("depois que a pessoa digitou, perder o foco confirma o texto", () => {
    const { textarea, root, onCommit } = setup();
    act(() => {
      vi.advanceTimersByTime(0);
    });
    fireEvent.input(textarea, { target: { value: "Funil de vendas" } });
    act(() => {
      root.focus();
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("Funil de vendas");
  });

  it("clicar fora depois de um tempo, mesmo sem digitar, confirma (texto vazio é descartado pelo motor)", () => {
    const { root, onCommit } = setup();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      root.focus();
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("");
  });

  it("Esc confirma uma vez só", () => {
    const { textarea, onCommit } = setup();
    act(() => {
      vi.advanceTimersByTime(0);
    });
    fireEvent.input(textarea, { target: { value: "Oi" } });
    fireEvent.keyDown(textarea, { key: "Escape" });
    fireEvent.blur(textarea);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("Oi");
  });

  it("Ctrl+Enter confirma e Enter sozinho não (quebra de linha)", () => {
    const { textarea, onCommit } = setup();
    act(() => {
      vi.advanceTimersByTime(0);
    });
    fireEvent.input(textarea, { target: { value: "a" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("abre com o texto que já existia (edição de texto antigo)", () => {
    const onCommit = vi.fn();
    const element = createElement("text", 0, 0, { text: "Olá\nmundo", fontSize: 24 });
    const { getByLabelText } = render(<TextEditor element={element} camera={camera} theme={theme} onCommit={onCommit} />);
    expect((getByLabelText("Texto do quadro") as HTMLTextAreaElement).value).toBe("Olá\nmundo");
  });
});
