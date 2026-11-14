import { describe, it, expect } from "vitest";
import { createElement } from "./scene";
import {
  alignElements,
  bringForward,
  bringToFront,
  cloneElements,
  duplicateElements,
  expandToGroups,
  groupElements,
  sendBackward,
  sendToBack,
  toggleLock,
  ungroupElements,
} from "./ops";

const box = (x: number, y = 0, extra = {}) => createElement("rectangle", x, y, { width: 10, height: 10, ...extra });
const ids = (...els: { id: string }[]) => new Set(els.map((e) => e.id));
const order = (els: { id: string }[], names: Record<string, string>) => els.map((e) => names[e.id]).join("");

describe("duplicateElements / cloneElements", () => {
  it("copia deslocada em 20, com id e seed novos, por cima dos originais", () => {
    const a = box(0);
    const b = box(100);
    const { elements, newIds } = duplicateElements([a, b], ids(a));
    expect(elements).toHaveLength(3);
    expect(elements[0]).toBe(a);
    const copy = elements[2];
    expect(newIds).toEqual([copy.id]);
    expect(copy.id).not.toBe(a.id);
    expect(copy.seed).not.toBe(a.seed);
    expect(copy).toMatchObject({ x: 20, y: 20, width: 10, type: "rectangle" });
  });

  it("grupos duplicados ficam com um groupId novo, comum às cópias", () => {
    const a = box(0, 0, { groupId: "g1" });
    const b = box(50, 0, { groupId: "g1" });
    const { elements } = duplicateElements([a, b], ids(a, b));
    const [c1, c2] = elements.slice(2);
    expect(c1.groupId).not.toBeNull();
    expect(c1.groupId).toBe(c2.groupId);
    expect(c1.groupId).not.toBe("g1");
  });

  it("cloneElements não compartilha a lista de pontos com o original", () => {
    const line = createElement("line", 0, 0, { points: [[0, 0], [10, 10]] });
    const [copy] = cloneElements([line], 0);
    copy.points![1][0] = 999;
    expect(line.points![1][0]).toBe(10);
  });
});

describe("agrupar", () => {
  it("groupElements dá o mesmo groupId aos selecionados e deixa os outros", () => {
    const [a, b, c] = [box(0), box(20), box(40)];
    const out = groupElements([a, b, c], ids(a, b));
    expect(out[0].groupId).not.toBeNull();
    expect(out[0].groupId).toBe(out[1].groupId);
    expect(out[2].groupId).toBeNull();
  });

  it("ungroupElements solta todo o grupo, mesmo selecionando só um membro", () => {
    const [a, b] = [box(0), box(20)];
    const grouped = groupElements([a, b], ids(a, b));
    const out = ungroupElements(grouped, ids(grouped[0]));
    expect(out.every((e) => e.groupId === null)).toBe(true);
  });

  it("expandToGroups inclui os outros membros do grupo", () => {
    const a = box(0, 0, { groupId: "g" });
    const b = box(20, 0, { groupId: "g" });
    const c = box(40);
    expect(expandToGroups([a, b, c], ids(a))).toEqual(ids(a, b));
    expect(expandToGroups([a, b, c], ids(c))).toEqual(ids(c));
  });
});

describe("camadas", () => {
  const [a, b, c] = [box(0), box(20), box(40)];
  const names = { [a.id]: "a", [b.id]: "b", [c.id]: "c" };
  const all = [a, b, c];

  it("bringToFront leva ao fim mantendo a ordem relativa", () => {
    expect(order(bringToFront(all, ids(a)), names)).toBe("bca");
    expect(order(bringToFront(all, ids(a, b)), names)).toBe("cab");
  });

  it("sendToBack leva ao início", () => {
    expect(order(sendToBack(all, ids(c)), names)).toBe("cab");
  });

  it("bringForward sobe uma posição e para no topo", () => {
    expect(order(bringForward(all, ids(a)), names)).toBe("bac");
    expect(order(bringForward(all, ids(c)), names)).toBe("abc");
    expect(order(bringForward(all, ids(a, b)), names)).toBe("cab");
  });

  it("sendBackward desce uma posição e para no fundo", () => {
    expect(order(sendBackward(all, ids(c)), names)).toBe("acb");
    expect(order(sendBackward(all, ids(a)), names)).toBe("abc");
  });

  it("não altera o array original", () => {
    bringToFront(all, ids(a));
    expect(order(all, names)).toBe("abc");
  });
});

describe("bloquear", () => {
  it("seleção mista trava tudo; tudo travado destrava", () => {
    const a = box(0, 0, { locked: true });
    const b = box(20);
    const locked = toggleLock([a, b], ids(a, b));
    expect(locked.map((e) => e.locked)).toEqual([true, true]);
    const unlocked = toggleLock(locked, ids(a, b));
    expect(unlocked.map((e) => e.locked)).toEqual([false, false]);
  });
});

describe("alinhar", () => {
  const a = box(50, 0, { height: 10 });
  const b = box(10, 40, { height: 20 });
  const c = box(100, 10, { height: 10 });
  const all = [a, b, c];
  const sel = ids(a, b, c);
  const xs = (els: { x: number }[]) => els.map((e) => e.x);
  const ys = (els: { y: number }[]) => els.map((e) => e.y);

  it("esquerda leva o x de todos ao menor x", () => {
    expect(xs(alignElements(all, sel, "left"))).toEqual([10, 10, 10]);
  });

  it("direita alinha as bordas direitas na maior", () => {
    expect(xs(alignElements(all, sel, "right"))).toEqual([100, 100, 100]);
  });

  it("centro alinha os centros no meio do conjunto", () => {
    // conjunto vai de x=10 a x=110: centro 60; elementos de largura 10 ficam com x=55
    expect(xs(alignElements(all, sel, "center"))).toEqual([55, 55, 55]);
  });

  it("topo, meio e base", () => {
    expect(ys(alignElements(all, sel, "top"))).toEqual([0, 0, 0]);
    expect(ys(alignElements(all, sel, "bottom"))).toEqual([50, 40, 50]);
    expect(ys(alignElements(all, sel, "middle"))).toEqual([25, 20, 25]);
  });

  it("não mexe em elementos fora da seleção nem nos bloqueados", () => {
    const locked = { ...c, locked: true };
    const out = alignElements([a, b, locked], ids(a, b, locked), "left");
    expect(out[2].x).toBe(100);
    expect(out[0].x).toBe(10);
  });

  it("alinhar com menos de dois itens não faz nada", () => {
    expect(alignElements(all, ids(a), "left")).toEqual(all);
  });
});
