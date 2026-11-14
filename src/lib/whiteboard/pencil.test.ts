import { describe, it, expect, vi } from "vitest";
import { freedrawPath } from "./render";
import { WhiteboardEngine } from "./engine";

describe("lápis chega até o último ponto", () => {
  it("o contorno do traço alcança o fim da linha (sem atraso de suavização)", () => {
    const d = freedrawPath([[0, 0], [100, 0]], 6);
    const nums = (d.match(/-?\d+\.?\d*/g) ?? []).map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(100);
  });

  it("soltar o mouse registra o ponto final mesmo sem movimento depois", () => {
    const engine = new WhiteboardEngine({
      onChange: vi.fn(),
      onToolChange: vi.fn(),
      onSelectionChange: vi.fn(),
      onRequestRender: vi.fn(),
    });
    engine.setTool("pencil");
    engine.pointerDown({ x: 0, y: 0, shift: false, ctrl: false, button: 0 });
    engine.pointerMove({ x: 5, y: 5, shift: false, ctrl: false, button: 0 });
    engine.pointerUp({ x: 10, y: 0, shift: false, ctrl: false, button: 0 });
    expect(engine.elements[0].points).toEqual([[0, 0], [5, 5], [10, 0]]);
  });
});
