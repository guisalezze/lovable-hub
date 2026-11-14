import { describe, it, expect, vi } from "vitest";
import { WhiteboardEngine } from "./engine";
import { createElement } from "./scene";

function setup() {
  const engine = new WhiteboardEngine({
    onChange: vi.fn(),
    onToolChange: vi.fn(),
    onSelectionChange: vi.fn(),
    onRequestRender: vi.fn(),
  });
  return engine;
}

describe("canUndo / canRedo", () => {
  it("começam falsos, mudam com o desenho e acompanham undo/redo", () => {
    const engine = setup();
    engine.load([createElement("rectangle", 0, 0, { width: 100, height: 50, backgroundColor: "#fff" })]);
    expect(engine.canUndo).toBe(false);
    expect(engine.canRedo).toBe(false);

    engine.setTool("ellipse");
    engine.pointerDown({ x: 200, y: 200, shift: false, ctrl: false, button: 0 });
    engine.pointerMove({ x: 260, y: 240, shift: false, ctrl: false, button: 0 });
    engine.pointerUp({ x: 260, y: 240, shift: false, ctrl: false, button: 0 });
    expect(engine.canUndo).toBe(true);
    expect(engine.canRedo).toBe(false);

    engine.undo();
    expect(engine.canUndo).toBe(false);
    expect(engine.canRedo).toBe(true);
  });
});
