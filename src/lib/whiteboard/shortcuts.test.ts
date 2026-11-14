import { describe, it, expect } from "vitest";
import { resolveShortcut } from "./shortcuts";

const key = (k: string, extra: Record<string, unknown> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  target: document.body as EventTarget | null,
  ...extra,
});

describe("resolveShortcut: ferramentas", () => {
  const cases: [string, string][] = [
    ["v", "select"], ["1", "select"],
    ["r", "rectangle"], ["2", "rectangle"],
    ["d", "diamond"], ["3", "diamond"],
    ["o", "ellipse"], ["4", "ellipse"],
    ["a", "arrow"], ["5", "arrow"],
    ["l", "line"], ["6", "line"],
    ["p", "pencil"], ["7", "pencil"],
    ["e", "eraser"], ["0", "eraser"],
    ["k", "laser"],
    ["h", "hand"],
  ];
  it.each(cases)("tecla %s escolhe %s", (k, tool) => {
    expect(resolveShortcut(key(k))).toEqual({ kind: "tool", tool });
  });

  it("maiúscula (caps lock) também vale", () => {
    expect(resolveShortcut(key("R"))).toEqual({ kind: "tool", tool: "rectangle" });
  });
});

describe("resolveShortcut: comandos", () => {
  it("Ctrl+Z desfaz; Ctrl+Shift+Z e Ctrl+Y refazem", () => {
    expect(resolveShortcut(key("z", { ctrlKey: true }))).toEqual({ kind: "undo" });
    expect(resolveShortcut(key("Z", { ctrlKey: true, shiftKey: true }))).toEqual({ kind: "redo" });
    expect(resolveShortcut(key("y", { ctrlKey: true }))).toEqual({ kind: "redo" });
  });

  it("Cmd (Mac) funciona como Ctrl", () => {
    expect(resolveShortcut(key("z", { metaKey: true }))).toEqual({ kind: "undo" });
  });

  it("Ctrl+D duplica e Ctrl+A seleciona tudo", () => {
    expect(resolveShortcut(key("d", { ctrlKey: true }))).toEqual({ kind: "duplicate" });
    expect(resolveShortcut(key("a", { ctrlKey: true }))).toEqual({ kind: "selectAll" });
  });

  it("Delete e Backspace apagam; Escape sai", () => {
    expect(resolveShortcut(key("Delete"))).toEqual({ kind: "delete" });
    expect(resolveShortcut(key("Backspace"))).toEqual({ kind: "delete" });
    expect(resolveShortcut(key("Escape"))).toEqual({ kind: "escape" });
  });

  it("Ctrl + letra de ferramenta não é atalho do quadro (ex.: Ctrl+R recarrega)", () => {
    expect(resolveShortcut(key("r", { ctrlKey: true }))).toBeNull();
    expect(resolveShortcut(key("p", { metaKey: true }))).toBeNull();
  });

  it("tecla desconhecida devolve null", () => {
    expect(resolveShortcut(key("q"))).toBeNull();
    expect(resolveShortcut(key("F5"))).toBeNull();
  });
});

describe("resolveShortcut: campos de texto", () => {
  const targets: [string, () => EventTarget][] = [
    ["input", () => document.createElement("input")],
    ["textarea", () => document.createElement("textarea")],
    ["select", () => document.createElement("select")],
    ["contenteditable", () => {
      const d = document.createElement("div");
      d.setAttribute("contenteditable", "true");
      return d;
    }],
  ];

  it.each(targets)("em %s nada dispara, nem Ctrl+Z", (_name, make) => {
    const target = make();
    expect(resolveShortcut(key("r", { target }))).toBeNull();
    expect(resolveShortcut(key("Delete", { target }))).toBeNull();
    expect(resolveShortcut(key("z", { ctrlKey: true, target }))).toBeNull();
    expect(resolveShortcut(key("a", { ctrlKey: true, target }))).toBeNull();
  });

  it("alvo nulo não quebra", () => {
    expect(resolveShortcut(key("r", { target: null }))).toEqual({ kind: "tool", tool: "rectangle" });
  });
});
