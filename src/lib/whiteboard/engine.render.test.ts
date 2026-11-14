import { describe, it, expect, vi, beforeEach } from "vitest";
import { WhiteboardEngine } from "./engine";
import { createElement } from "./scene";
import { clipboard } from "./ops";

/** Toda operação que muda a cena ou a seleção precisa pedir um novo desenho (senão o canvas fica desatualizado). */
function ready() {
  const cb = { onChange: vi.fn(), onToolChange: vi.fn(), onSelectionChange: vi.fn(), onRequestRender: vi.fn() };
  const engine = new WhiteboardEngine(cb);
  engine.load([
    createElement("rectangle", 0, 0, { width: 100, height: 50, backgroundColor: "#fff" }),
    createElement("rectangle", 300, 100, { width: 100, height: 50, backgroundColor: "#fff" }),
  ]);
  engine.selectAll();
  cb.onRequestRender.mockClear();
  return { engine, cb };
}

beforeEach(() => {
  clipboard.items = [];
  clipboard.pasteCount = 0;
});

type Cb = ReturnType<typeof ready>["cb"];
const onlyFirst = (e: WhiteboardEngine, cb: Cb) => {
  e.clearSelection();
  e.selectAtPoint({ x: 50, y: 25 }); // só o primeiro, para a ordem poder mudar
  cb.onRequestRender.mockClear();
};
const onlySecond = (e: WhiteboardEngine, cb: Cb) => {
  e.clearSelection();
  e.selectAtPoint({ x: 350, y: 125 });
  cb.onRequestRender.mockClear();
};

const operations: [string, (e: WhiteboardEngine, cb: Cb) => void][] = [
  ["duplicate", (e) => e.duplicate()],
  ["group", (e) => e.group()],
  ["bringToFront", (e, cb) => { onlyFirst(e, cb); e.bringToFront(); }],
  ["sendToBack", (e, cb) => { onlySecond(e, cb); e.sendToBack(); }],
  ["toggleLock", (e) => e.toggleLock()],
  ["align", (e) => e.align("top")],
  ["deleteSelection", (e) => e.deleteSelection()],
  ["cut", (e) => e.cut()],
  ["applyStyle", (e) => e.applyStyle({ strokeColor: "#e03131" })],
];

describe("pedido de redesenho", () => {
  it.each(operations)("%s pede redesenho", (_name, run) => {
    const { engine, cb } = ready();
    run(engine, cb);
    expect(cb.onRequestRender).toHaveBeenCalled();
  });

  it("paste pede redesenho", () => {
    const { engine, cb } = ready();
    engine.copy();
    cb.onRequestRender.mockClear();
    engine.paste();
    expect(cb.onRequestRender).toHaveBeenCalled();
  });

  it("ungroup pede redesenho", () => {
    const { engine, cb } = ready();
    engine.group();
    cb.onRequestRender.mockClear();
    engine.ungroup();
    expect(cb.onRequestRender).toHaveBeenCalled();
  });

  it("undo e redo pedem redesenho", () => {
    const { engine, cb } = ready();
    engine.duplicate();
    cb.onRequestRender.mockClear();
    engine.undo();
    expect(cb.onRequestRender).toHaveBeenCalled();
    cb.onRequestRender.mockClear();
    engine.redo();
    expect(cb.onRequestRender).toHaveBeenCalled();
  });
});
