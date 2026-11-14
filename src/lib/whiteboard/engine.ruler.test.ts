import { describe, it, expect, vi } from "vitest";
import { WhiteboardEngine, type PointerInput } from "./engine";

const pt = (x: number, y: number): PointerInput => ({ x, y, shift: false, ctrl: false, button: 0 });

function setup() {
  const cb = { onChange: vi.fn(), onToolChange: vi.fn(), onSelectionChange: vi.fn(), onRequestRender: vi.fn() };
  return { engine: new WhiteboardEngine(cb), cb };
}

describe("régua: posição do cursor", () => {
  it("começa sem cursor e com a régua desligada", () => {
    const { engine } = setup();
    expect(engine.cursor).toBeNull();
    expect(engine.rulerOn).toBe(false);
  });

  it("passar o mouse guarda a posição em coordenadas do mundo (respeita a câmera)", () => {
    const { engine } = setup();
    engine.camera = { x: 100, y: 50, zoom: 2 };
    engine.pointerMove(pt(40, 20));
    expect(engine.cursor).toEqual({ x: 120, y: 60 });
  });

  it("com a régua desligada, passar o mouse NÃO pede redesenho (custa nada)", () => {
    const { engine, cb } = setup();
    engine.pointerMove(pt(40, 20));
    expect(cb.onRequestRender).not.toHaveBeenCalled();
  });

  it("com a régua ligada, passar o mouse redesenha", () => {
    const { engine, cb } = setup();
    engine.setRuler(true);
    cb.onRequestRender.mockClear();
    engine.pointerMove(pt(40, 20));
    expect(cb.onRequestRender).toHaveBeenCalled();
  });

  it("o mouse sair do quadro limpa o cursor e some a régua da tela", () => {
    const { engine, cb } = setup();
    engine.setRuler(true);
    engine.pointerMove(pt(40, 20));
    cb.onRequestRender.mockClear();
    engine.pointerLeave();
    expect(engine.cursor).toBeNull();
    expect(cb.onRequestRender).toHaveBeenCalled();
  });

  it("a posição também acompanha durante um arrasto", () => {
    const { engine } = setup();
    engine.setTool("rectangle");
    engine.pointerDown(pt(10, 10));
    engine.pointerMove(pt(80, 60));
    expect(engine.cursor).toEqual({ x: 80, y: 60 });
    engine.pointerUp(pt(80, 60));
  });

  it("ligar e desligar redesenha", () => {
    const { engine, cb } = setup();
    engine.setRuler(true);
    expect(engine.rulerOn).toBe(true);
    engine.setRuler(false);
    expect(engine.rulerOn).toBe(false);
    expect(cb.onRequestRender).toHaveBeenCalledTimes(2);
  });
});
