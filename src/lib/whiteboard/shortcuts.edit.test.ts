import { describe, it, expect } from "vitest";
import { resolveShortcut } from "./shortcuts";

const key = (k: string, extra: Record<string, unknown> = {}) => ({
  key: k, ctrlKey: false, metaKey: false, shiftKey: false, target: document.body as EventTarget | null, ...extra,
});

describe("atalhos de edição", () => {
  it("Ctrl+C, Ctrl+V e Ctrl+X", () => {
    expect(resolveShortcut(key("c", { ctrlKey: true }))).toEqual({ kind: "copy" });
    expect(resolveShortcut(key("v", { ctrlKey: true }))).toEqual({ kind: "paste" });
    expect(resolveShortcut(key("x", { ctrlKey: true }))).toEqual({ kind: "cut" });
  });

  it("Ctrl+G agrupa e Ctrl+Shift+G desagrupa", () => {
    expect(resolveShortcut(key("g", { ctrlKey: true }))).toEqual({ kind: "group" });
    expect(resolveShortcut(key("G", { ctrlKey: true, shiftKey: true }))).toEqual({ kind: "ungroup" });
  });

  it("Ctrl+Shift+L bloqueia (Ctrl+L é da barra de endereço do navegador)", () => {
    expect(resolveShortcut(key("L", { ctrlKey: true, shiftKey: true }))).toEqual({ kind: "lock" });
    expect(resolveShortcut(key("l", { ctrlKey: true }))).toBeNull();
  });

  it("] e [ sobem e descem uma camada; com Ctrl vão para a frente e para o fundo", () => {
    expect(resolveShortcut(key("]"))).toEqual({ kind: "forward" });
    expect(resolveShortcut(key("["))).toEqual({ kind: "backward" });
    expect(resolveShortcut(key("]", { ctrlKey: true }))).toEqual({ kind: "front" });
    expect(resolveShortcut(key("[", { ctrlKey: true }))).toEqual({ kind: "back" });
  });

  it("nada disso dispara dentro de um campo de texto", () => {
    const target = document.createElement("input");
    for (const k of ["c", "v", "x", "g"]) {
      expect(resolveShortcut(key(k, { ctrlKey: true, target }))).toBeNull();
    }
    expect(resolveShortcut(key("]", { target }))).toBeNull();
  });
});
