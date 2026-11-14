import { describe, it, expect } from "vitest";
import { createElement, docFromElements, parseDoc, serializeDoc, serializeScene } from "./scene";
import { activePage, addPage, deletePage, duplicatePage, movePage, renamePage, setActivePage, updateActiveElements } from "./pages";
import type { SceneDoc, WbElement } from "./types";

const box = (x: number, extra: Partial<WbElement> = {}) => createElement("rectangle", x, 0, { width: 10, height: 10, ...extra });
const doc3 = (): SceneDoc => {
  let d = docFromElements([box(0)]);
  d = addPage(d).doc;
  d = addPage(d).doc;
  return setActivePage(d, d.pages[0].id);
};

describe("docFromElements / serializeDoc", () => {
  it("um quadro simples vira um documento com uma página", () => {
    const els = [box(0)];
    const doc = docFromElements(els);
    expect(doc.version).toBe(2);
    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0]).toMatchObject({ name: "Página 1", elements: els });
    expect(doc.activePageId).toBe(doc.pages[0].id);
  });

  it("serializeDoc devolve algo que dá para guardar como JSON e ler de volta", () => {
    const doc = doc3();
    const back = parseDoc(JSON.parse(JSON.stringify(serializeDoc(doc))));
    expect(back).toEqual({ ok: true, doc });
  });
});

describe("parseDoc", () => {
  it("lê o formato antigo (uma lista de elementos) como uma página só, sempre igual", () => {
    const raw = serializeScene([box(0), box(20)]);
    const a = parseDoc(raw);
    const b = parseDoc(raw);
    expect(a).toEqual(b); // o id da página migrada não pode mudar a cada leitura
    expect(a.ok && a.doc.pages).toHaveLength(1);
    expect(a.ok && a.doc.pages[0].elements).toHaveLength(2);
  });

  it("lê o formato novo", () => {
    const doc = doc3();
    expect(parseDoc(serializeDoc(doc))).toEqual({ ok: true, doc });
  });

  it("página ativa desconhecida volta para a primeira", () => {
    const doc = doc3();
    const r = parseDoc({ ...serializeDoc(doc), activePageId: "nao-existe" });
    expect(r.ok && r.doc.activePageId).toBe(doc.pages[0].id);
  });

  it("recusa versão desconhecida", () => {
    expect(parseDoc({ version: 3, pages: [] })).toMatchObject({ ok: false, error: expect.stringContaining("versão") });
  });

  it("recusa documento sem páginas, com páginas repetidas ou malformadas", () => {
    const good = serializeDoc(doc3());
    const bads: unknown[] = [
      "lixo",
      null,
      { version: 2, pages: [] },
      { version: 2, pages: "x" },
      { ...good, pages: [good.pages[0], { ...good.pages[0] }] }, // mesmo id duas vezes
      { ...good, pages: [{ ...good.pages[0], id: "" }] },
      { ...good, pages: [{ ...good.pages[0], name: 7 }] },
      { ...good, pages: [{ ...good.pages[0], elements: "x" }] },
    ];
    for (const bad of bads) expect(parseDoc(bad).ok).toBe(false);
  });

  it("elemento inválido dentro de uma página não é descartado em silêncio e o erro diz em qual página", () => {
    const good = serializeDoc(doc3());
    const bad = { ...good, pages: [{ ...good.pages[0], name: "Funil", elements: [{ ...box(0), type: "triangulo" }] }] };
    const r = parseDoc(bad);
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("Funil") });
  });
});

describe("páginas: adicionar, renomear, excluir", () => {
  it("adicionar põe a página no fim, com o próximo nome livre, e a ativa", () => {
    const base = docFromElements([]);
    const { doc, id } = addPage(base);
    expect(doc.pages.map((p) => p.name)).toEqual(["Página 1", "Página 2"]);
    expect(doc.activePageId).toBe(id);
    expect(doc.pages[1].elements).toEqual([]);
  });

  it("o nome novo não repete um já existente", () => {
    let d = docFromElements([]);
    d = addPage(d).doc; // Página 2
    d = deletePage(d, d.pages[0].id); // sobra só a "Página 2"
    expect(addPage(d).doc.pages.map((p) => p.name)).toEqual(["Página 2", "Página 3"]);
  });

  it("renomear aparando espaços; nome vazio não muda nada; nome enorme é cortado", () => {
    const d = docFromElements([]);
    const id = d.pages[0].id;
    expect(activePage(renamePage(d, id, "  Funil  "))!.name).toBe("Funil");
    expect(renamePage(d, id, "   ")).toBe(d);
    expect(activePage(renamePage(d, id, "x".repeat(200)))!.name).toHaveLength(60);
    expect(renamePage(d, "nao-existe", "A")).toBe(d);
  });

  it("excluir tira a página e passa para a vizinha (a anterior, se houver)", () => {
    const d = doc3();
    const [p1, p2, p3] = d.pages.map((p) => p.id);
    const afterMiddle = deletePage(setActivePage(d, p2), p2);
    expect(afterMiddle.pages.map((p) => p.id)).toEqual([p1, p3]);
    expect(afterMiddle.activePageId).toBe(p1);
    const afterFirst = deletePage(setActivePage(d, p1), p1);
    expect(afterFirst.activePageId).toBe(p2);
  });

  it("excluir uma página que não é a ativa não muda a ativa", () => {
    const d = doc3();
    const [p1, , p3] = d.pages.map((p) => p.id);
    expect(deletePage(d, p3).activePageId).toBe(p1);
  });

  it("a última página não pode ser excluída", () => {
    const d = docFromElements([box(0)]);
    expect(deletePage(d, d.pages[0].id)).toBe(d);
  });
});

describe("páginas: duplicar, mover, ativar, atualizar", () => {
  it("duplicar cria uma cópia logo depois, com elementos novos, e a ativa", () => {
    const a = box(0);
    const arrow = createElement("arrow", 20, 0, { points: [[0, 0], [30, 0]], bindings: { start: a.id } });
    const d = docFromElements([a, arrow]);
    const { doc, id } = duplicatePage(d, d.pages[0].id);
    expect(doc.pages.map((p) => p.name)).toEqual(["Página 1", "Página 1 (cópia)"]);
    expect(doc.activePageId).toBe(id);
    const copy = doc.pages[1].elements;
    expect(copy).toHaveLength(2);
    expect(copy[0].id).not.toBe(a.id);
    expect(copy[1].bindings).toEqual({ start: copy[0].id }); // a seta da cópia prende na forma da cópia
    expect(copy[0].x).toBe(0); // sem deslocamento: é a mesma página
  });

  it("duplicar uma página que não existe não faz nada", () => {
    const d = docFromElements([]);
    expect(duplicatePage(d, "x").doc).toBe(d);
  });

  it("mover reordena; índice fora do limite é ajustado; mesmo lugar não muda nada", () => {
    const d = doc3();
    const [p1, p2, p3] = d.pages.map((p) => p.id);
    expect(movePage(d, p1, 2).pages.map((p) => p.id)).toEqual([p2, p3, p1]);
    expect(movePage(d, p3, -5).pages.map((p) => p.id)).toEqual([p3, p1, p2]);
    expect(movePage(d, p2, 99).pages.map((p) => p.id)).toEqual([p1, p3, p2]);
    expect(movePage(d, p2, 1)).toBe(d);
  });

  it("ativar uma página desconhecida não muda nada", () => {
    const d = doc3();
    expect(setActivePage(d, "x")).toBe(d);
  });

  it("atualizar os elementos mexe só na página ativa", () => {
    const d = doc3();
    const [p1, p2] = d.pages.map((p) => p.id);
    const next = updateActiveElements(d, [box(99)]);
    expect(next.pages[0].elements[0].x).toBe(99);
    expect(next.pages[1]).toBe(d.pages[1]);
    expect(activePage(next)!.id).toBe(p1);
    expect(p2).toBeDefined();
  });
});
