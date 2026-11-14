import { describe, it, expect } from "vitest";
import { createElement } from "./scene";
import { History } from "./history";

const el = (x: number) => createElement("rectangle", x, 0);

describe("History", () => {
  it("desfaz e refaz", () => {
    const a = [el(1)];
    const b = [el(1), el(2)];
    const h = new History(a);
    h.push(b);
    expect(h.undo()).toEqual(a);
    expect(h.redo()).toEqual(b);
  });

  it("undo no começo e redo no fim devolvem null", () => {
    const h = new History([el(1)]);
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBeNull();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
  });

  it("push depois de undo descarta o refazer", () => {
    const h = new History([el(1)]);
    h.push([el(2)]);
    h.undo();
    expect(h.canRedo).toBe(true);
    h.push([el(3)]);
    expect(h.canRedo).toBe(false);
    expect(h.redo()).toBeNull();
  });

  it("respeita o limite descartando o mais antigo", () => {
    const [a, b, c, d] = [[el(1)], [el(2)], [el(3)], [el(4)]];
    const h = new History(a, 3);
    h.push(b);
    h.push(c);
    h.push(d);
    expect(h.undo()).toEqual(c);
    expect(h.undo()).toEqual(b);
    expect(h.undo()).toBeNull();
  });

  it("guarda cópias: mexer no que veio de fora ou de dentro não altera o histórico", () => {
    const a = [el(1)];
    const h = new History(a);
    a[0].x = 999;
    h.push([el(2)]);
    const back = h.undo();
    expect(back[0].x).toBe(1);
    back[0].x = 555;
    h.redo();
    expect(h.undo()[0].x).toBe(1);
  });

  it("reset limpa tudo", () => {
    const h = new History([el(1)]);
    h.push([el(2)]);
    h.reset([el(9)]);
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
  });
});
