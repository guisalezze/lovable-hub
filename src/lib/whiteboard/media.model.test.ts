import { describe, it, expect } from "vitest";
import { createElement, parseScene, serializeScene } from "./scene";
import { hitTest } from "./geometry";
import { isBindable } from "./binding";
import { resolveShortcut } from "./shortcuts";

const image = (extra = {}) =>
  createElement("image", 10, 20, { width: 200, height: 100, fileId: "b1/abc-foto.png", mime: "image/png", fileName: "foto.png", natural: { width: 800, height: 400 }, ...extra });

describe("cena com mídia", () => {
  it("imagem com corte e espelho vai e volta", () => {
    const els = [image({ crop: { x: 10, y: 20, width: 300, height: 200 }, flipX: true, flipY: false })];
    expect(parseScene(serializeScene(els))).toEqual({ ok: true, elements: els });
  });

  it("áudio e vídeo (tipo media) também", () => {
    const els = [createElement("media", 0, 0, { width: 320, height: 64, fileId: "b1/x.mp3", mime: "audio/mpeg", fileName: "x.mp3" })];
    expect(parseScene(serializeScene(els))).toEqual({ ok: true, elements: els });
  });

  it("recusa campos de mídia com formato errado", () => {
    const bads = [
      { fileId: 5 },
      { mime: 5 },
      { fileName: {} },
      { natural: { width: "x", height: 1 } },
      { natural: [1, 2] },
      { crop: { x: 0, y: 0, width: 1 } },
      { crop: "x" },
      { flipX: "sim" },
      { flipY: 1 },
    ];
    for (const bad of bads) expect(parseScene({ version: 1, elements: [{ ...image(), ...bad }] }).ok).toBe(false);
  });
});

describe("clicar numa mídia", () => {
  it("a imagem é clicável por dentro, mesmo sem preenchimento", () => {
    const el = image();
    expect(hitTest(el, { x: 110, y: 70 }, 4)).toBe(true);
    expect(hitTest(el, { x: 500, y: 500 }, 4)).toBe(false);
  });

  it("vídeo e áudio também", () => {
    const el = createElement("media", 0, 0, { width: 320, height: 64, fileId: "x", mime: "audio/mpeg" });
    expect(hitTest(el, { x: 160, y: 32 }, 4)).toBe(true);
  });

  it("imagem e mídia recebem seta presa", () => {
    expect(isBindable(image())).toBe(true);
    expect(isBindable(createElement("media", 0, 0, { fileId: "x", mime: "video/mp4" }))).toBe(true);
  });
});

describe("atalhos de espelhar", () => {
  const key = (k: string, extra: Record<string, unknown> = {}) => ({
    key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, target: document.body as EventTarget | null, ...extra,
  });

  it("Shift+H espelha na horizontal e Shift+V na vertical", () => {
    expect(resolveShortcut(key("H", { shiftKey: true }))).toEqual({ kind: "flip", axis: "x" });
    expect(resolveShortcut(key("V", { shiftKey: true }))).toEqual({ kind: "flip", axis: "y" });
  });

  it("H e V sem Shift continuam escolhendo a mão e a seleção", () => {
    expect(resolveShortcut(key("h"))).toEqual({ kind: "tool", tool: "hand" });
    expect(resolveShortcut(key("v"))).toEqual({ kind: "tool", tool: "select" });
  });

  it("não dispara dentro de um campo de texto", () => {
    expect(resolveShortcut(key("H", { shiftKey: true, target: document.createElement("input") }))).toBeNull();
  });

  it("Ctrl+Shift+H (marca-texto do editor) não vira espelhar", () => {
    expect(resolveShortcut(key("H", { shiftKey: true, ctrlKey: true }))).toBeNull();
  });
});
