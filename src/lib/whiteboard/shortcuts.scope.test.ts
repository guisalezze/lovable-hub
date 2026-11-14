import { describe, it, expect } from "vitest";
import { isInsideWhiteboard } from "./shortcuts";

describe("isInsideWhiteboard", () => {
  it("true para a raiz do quadro e para qualquer descendente", () => {
    const root = document.createElement("div");
    root.setAttribute("data-whiteboard-root", "");
    const canvas = document.createElement("canvas");
    root.appendChild(canvas);
    document.body.appendChild(root);
    expect(isInsideWhiteboard(root)).toBe(true);
    expect(isInsideWhiteboard(canvas)).toBe(true);
    root.remove();
  });

  it("false fora do quadro, para alvo nulo e para alvo que não é elemento", () => {
    expect(isInsideWhiteboard(document.createElement("div"))).toBe(false);
    expect(isInsideWhiteboard(null)).toBe(false);
    expect(isInsideWhiteboard(window)).toBe(false);
    expect(isInsideWhiteboard(document)).toBe(false);
  });
});
