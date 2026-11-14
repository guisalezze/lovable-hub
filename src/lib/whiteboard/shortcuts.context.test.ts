import { describe, it, expect } from "vitest";
import { isWhiteboardContext } from "./shortcuts";

describe("isWhiteboardContext", () => {
  it("dentro do elemento do quadro, em qualquer página", () => {
    const root = document.createElement("div");
    root.setAttribute("data-whiteboard-root", "");
    const child = document.createElement("button");
    root.appendChild(child);
    document.body.appendChild(root);
    expect(isWhiteboardContext(child, "/leads")).toBe(true);
    root.remove();
  });

  it("com o quadro aberto (/quadro/:id) vale mesmo com o foco no corpo da página", () => {
    expect(isWhiteboardContext(document.body, "/quadro/abc-123")).toBe(true);
  });

  it("vale também para menus que o Radix leva para fora do quadro (alvo qualquer)", () => {
    const portaled = document.createElement("div");
    document.body.appendChild(portaled);
    expect(isWhiteboardContext(portaled, "/quadro/abc-123")).toBe(true);
    portaled.remove();
  });

  it("alvo nulo com o quadro aberto também vale", () => {
    expect(isWhiteboardContext(null, "/quadro/abc-123")).toBe(true);
  });

  it("fora do quadro os atalhos do CRM continuam livres", () => {
    expect(isWhiteboardContext(document.body, "/leads")).toBe(false);
    expect(isWhiteboardContext(document.body, "/")).toBe(false);
    expect(isWhiteboardContext(null, "/tarefas")).toBe(false);
  });

  it("a lista de quadros (/quadro) e rotas parecidas não contam como quadro aberto", () => {
    expect(isWhiteboardContext(document.body, "/quadro")).toBe(false);
    expect(isWhiteboardContext(document.body, "/quadros")).toBe(false);
  });
});
