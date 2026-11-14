import { describe, it, expect, vi } from "vitest";
import { WhiteboardEngine, type PointerInput } from "./engine";

const pt = (x: number, y: number): PointerInput => ({ x, y, shift: false, ctrl: false, button: 0 });

function setup() {
  const cb = { onChange: vi.fn(), onToolChange: vi.fn(), onSelectionChange: vi.fn(), onRequestRender: vi.fn() };
  const engine = new WhiteboardEngine(cb);
  engine.load([]);
  return { engine, cb };
}

const info = { fileId: "f.png", mime: "image/png", fileName: "f.png", kind: "image" as const, natural: { width: 1000, height: 500 } };

describe("inserir mídia", () => {
  it("imagem entra centralizada, ajustada ao tamanho padrão, selecionada, com um passo de histórico", () => {
    const { engine, cb } = setup();
    const el = engine.addMedia(info, { x: 500, y: 300 });
    expect(el).toMatchObject({ type: "image", width: 480, height: 240, fileId: "f.png", mime: "image/png", natural: { width: 1000, height: 500 } });
    expect(el.x).toBe(260);
    expect(el.y).toBe(180);
    expect([...engine.selectedIds]).toEqual([el.id]);
    expect(cb.onChange).toHaveBeenCalledTimes(1);
    engine.undo();
    expect(engine.elements).toHaveLength(0);
  });

  it("áudio vira um elemento de mídia em forma de barra", () => {
    const { engine } = setup();
    const el = engine.addMedia({ fileId: "a.mp3", mime: "audio/mpeg", fileName: "a.mp3", kind: "audio", natural: null }, { x: 0, y: 0 });
    expect(el).toMatchObject({ type: "media", width: 320, height: 64 });
  });
});

describe("espelhar, girar e cortar", () => {
  it("espelhar muda só o eixo pedido e desfaz", () => {
    const { engine } = setup();
    engine.addMedia(info, { x: 500, y: 300 });
    engine.flipSelected("x");
    expect(engine.elements[0].flipX).toBe(true);
    expect(engine.elements[0].flipY).toBeFalsy();
    engine.undo();
    expect(engine.elements[0].flipX).toBeFalsy();
  });

  it("girar 90° soma um quarto de volta ao ângulo", () => {
    const { engine } = setup();
    engine.addMedia(info, { x: 500, y: 300 });
    engine.rotateSelected90();
    engine.rotateSelected90();
    expect(engine.elements[0].angle).toBeCloseTo(Math.PI);
  });

  it("modo de corte: arrastar a alça direita para dentro corta e não redimensiona a escala", () => {
    const { engine } = setup();
    engine.addMedia(info, { x: 500, y: 300 }); // x 260..740, y 180..420
    engine.startCrop();
    expect(engine.cropId).toBe(engine.elements[0].id);
    engine.pointerDown(pt(740, 300));
    engine.pointerMove(pt(640, 300));
    engine.pointerUp(pt(640, 300));
    const el = engine.elements[0];
    expect(el.width).toBeCloseTo(380);
    expect(el.crop).toMatchObject({ x: 0, y: 0 });
    expect(el.crop!.width).toBeCloseTo(380 / 0.48); // escala 480/1000
  });

  it("remover o corte devolve a imagem inteira", () => {
    const { engine } = setup();
    engine.addMedia(info, { x: 500, y: 300 });
    engine.startCrop();
    engine.pointerDown(pt(740, 300));
    engine.pointerMove(pt(640, 300));
    engine.pointerUp(pt(640, 300));
    engine.resetSelectedCrop();
    expect(engine.elements[0].crop).toBeUndefined();
    expect(engine.elements[0].width).toBeCloseTo(480);
    expect(engine.cropId).toBeNull();
  });

  it("duplo clique numa imagem entra no modo de corte", () => {
    const { engine } = setup();
    engine.addMedia(info, { x: 500, y: 300 });
    engine.clearSelection();
    engine.doubleClick({ x: 500, y: 300 });
    expect(engine.cropId).toBe(engine.elements[0].id);
  });

  it("clicar fora do corte termina o modo de corte", () => {
    const { engine } = setup();
    engine.addMedia(info, { x: 500, y: 300 });
    engine.startCrop();
    engine.pointerDown(pt(50, 50));
    engine.pointerUp(pt(50, 50));
    expect(engine.cropId).toBeNull();
  });

  it("imagem bloqueada não entra em corte nem espelha", () => {
    const { engine } = setup();
    const el = engine.addMedia(info, { x: 500, y: 300 });
    engine.elements = engine.elements.map((e) => ({ ...e, locked: true }));
    engine.flipSelected("x");
    engine.startCrop();
    expect(engine.cropId).toBeNull();
    expect(engine.elements.find((e) => e.id === el.id)!.flipX).toBeFalsy();
  });
});
