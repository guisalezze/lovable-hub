import { describe, it, expect, vi } from "vitest";
import { LASER_LIFETIME_MS, addLaserPoint, endLaserTrail, laserAlpha, pruneLaser } from "./laser";
import { WhiteboardEngine, type PointerInput } from "./engine";
import { createElement } from "./scene";

describe("laserAlpha", () => {
  const point = { x: 0, y: 0, t: 1000 };

  it("começa em 1, cai linearmente e chega a 0 na vida do ponto", () => {
    expect(LASER_LIFETIME_MS).toBe(900);
    expect(laserAlpha(point, 1000)).toBe(1);
    expect(laserAlpha(point, 1450)).toBeCloseTo(0.5);
    expect(laserAlpha(point, 1900)).toBe(0);
  });

  it("nunca sai do intervalo [0, 1]", () => {
    expect(laserAlpha(point, 5000)).toBe(0);
    expect(laserAlpha(point, 500)).toBe(1); // relógio "voltou": não passa de 1
  });
});

describe("trilhas do laser", () => {
  it("o primeiro ponto abre uma trilha e os seguintes entram nela", () => {
    let trails = addLaserPoint([], { x: 1, y: 1 }, 0);
    trails = addLaserPoint(trails, { x: 2, y: 2 }, 16);
    expect(trails).toHaveLength(1);
    expect(trails[0].points).toEqual([{ x: 1, y: 1, t: 0 }, { x: 2, y: 2, t: 16 }]);
    expect(trails[0].ended).toBeNull();
  });

  it("depois de encerrada, um novo ponto abre outra trilha", () => {
    let trails = addLaserPoint([], { x: 1, y: 1 }, 0);
    trails = endLaserTrail(trails, 50);
    expect(trails[0].ended).toBe(50);
    trails = addLaserPoint(trails, { x: 9, y: 9 }, 100);
    expect(trails).toHaveLength(2);
  });

  it("endLaserTrail sem trilha aberta não quebra", () => {
    expect(endLaserTrail([], 10)).toEqual([]);
  });

  it("pruneLaser tira pontos velhos e trilhas que ficaram vazias", () => {
    let trails = addLaserPoint([], { x: 0, y: 0 }, 0);
    trails = addLaserPoint(trails, { x: 1, y: 1 }, 500);
    trails = endLaserTrail(trails, 500);
    trails = addLaserPoint(trails, { x: 5, y: 5 }, 600);

    const at1000 = pruneLaser(trails, 1000); // o ponto de t=0 já passou de 900 ms
    expect(at1000[0].points).toHaveLength(1);
    expect(at1000).toHaveLength(2);

    const at2000 = pruneLaser(trails, 2000);
    expect(at2000).toEqual([]);
  });

  it("não altera as trilhas originais", () => {
    const trails = addLaserPoint([], { x: 0, y: 0 }, 0);
    pruneLaser(trails, 5000);
    expect(trails[0].points).toHaveLength(1);
  });
});

const pt = (x: number, y: number): PointerInput => ({ x, y, shift: false, ctrl: false, button: 0 });

function setup() {
  const cb = { onChange: vi.fn(), onToolChange: vi.fn(), onSelectionChange: vi.fn(), onRequestRender: vi.fn() };
  const engine = new WhiteboardEngine(cb);
  let now = 0;
  engine.clock = () => now;
  return { engine, cb, setNow: (t: number) => (now = t) };
}

describe("laser no motor", () => {
  it("arrastar com o laser faz rastro sem criar elemento, sem onChange e sem histórico", () => {
    const { engine, cb, setNow } = setup();
    engine.load([createElement("rectangle", 500, 500, { width: 10, height: 10 })]);
    engine.setTool("laser");
    setNow(0);
    engine.pointerDown(pt(10, 10));
    setNow(16);
    engine.pointerMove(pt(20, 20));
    setNow(32);
    engine.pointerUp(pt(30, 30));

    expect(engine.trails).toHaveLength(1);
    expect(engine.trails[0].points.length).toBeGreaterThanOrEqual(2);
    expect(engine.trails[0].ended).toBe(32);
    expect(engine.elements).toHaveLength(1);
    expect(cb.onChange).not.toHaveBeenCalled();
    expect(engine.canUndo).toBe(false);
  });

  it("as coordenadas do rastro são do mundo (respeitam a câmera)", () => {
    const { engine } = setup();
    engine.camera = { x: 100, y: 0, zoom: 2 };
    engine.setTool("laser");
    engine.pointerDown(pt(40, 20));
    expect(engine.trails[0].points[0]).toMatchObject({ x: 120, y: 10 });
  });

  it("tickLaser apaga o que venceu e diz se ainda há rastro para animar", () => {
    const { engine, setNow } = setup();
    engine.setTool("laser");
    setNow(0);
    engine.pointerDown(pt(5, 5));
    engine.pointerUp(pt(5, 5));
    expect(engine.tickLaser(100)).toBe(true);
    expect(engine.trails).toHaveLength(1);
    expect(engine.tickLaser(5000)).toBe(false);
    expect(engine.trails).toEqual([]);
  });

  it("cancelar o gesto encerra a trilha", () => {
    const { engine } = setup();
    engine.setTool("laser");
    engine.pointerDown(pt(5, 5));
    engine.pointerCancel();
    expect(engine.trails[0].ended).not.toBeNull();
  });

  it("trocar de ferramenta no meio do rastro não deixa trilha aberta para sempre", () => {
    const { engine } = setup();
    engine.setTool("laser");
    engine.pointerDown(pt(5, 5));
    engine.setTool("select");
    expect(engine.trails.every((t) => t.ended !== null)).toBe(true);
  });
});
