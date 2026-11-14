import { describe, it, expect } from "vitest";
import {
  MAX_FILE_BYTES,
  cropResize,
  defaultSizeFor,
  fitSize,
  fullBounds,
  mediaKindOf,
  resetCrop,
  sourceRect,
  toggleFlip,
  validateFile,
} from "./imageops";
import { createElement } from "./scene";
import type { WbElement } from "./types";

const img = (extra: Partial<WbElement> = {}) =>
  createElement("image", 0, 0, { width: 500, height: 250, natural: { width: 1000, height: 500 }, fileId: "f", mime: "image/png", ...extra });

describe("mediaKindOf", () => {
  it("separa imagem, áudio e vídeo pelo tipo do arquivo", () => {
    expect(mediaKindOf("image/png")).toBe("image");
    expect(mediaKindOf("image/jpeg")).toBe("image");
    expect(mediaKindOf("image/svg+xml")).toBe("image");
    expect(mediaKindOf("video/mp4")).toBe("video");
    expect(mediaKindOf("audio/mpeg")).toBe("audio");
  });

  it("o resto não é mídia do quadro", () => {
    expect(mediaKindOf("application/pdf")).toBeNull();
    expect(mediaKindOf("text/html")).toBeNull();
    expect(mediaKindOf("")).toBeNull();
  });
});

describe("validateFile", () => {
  const ok = { name: "foto.png", type: "image/png", size: 1000 };

  it("aceita arquivo de mídia de tamanho razoável", () => {
    expect(validateFile(ok)).toEqual({ ok: true, kind: "image" });
    expect(validateFile({ name: "a.mp4", type: "video/mp4", size: MAX_FILE_BYTES })).toEqual({ ok: true, kind: "video" });
  });

  it("recusa tipo que não é mídia, dizendo o nome do arquivo", () => {
    const r = validateFile({ name: "contrato.pdf", type: "application/pdf", size: 10 });
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("contrato.pdf") });
  });

  it("recusa arquivo grande demais", () => {
    const r = validateFile({ ...ok, size: MAX_FILE_BYTES + 1 });
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("grande") });
  });

  it("recusa arquivo vazio", () => {
    expect(validateFile({ ...ok, size: 0 }).ok).toBe(false);
  });
});

describe("fitSize / defaultSizeFor", () => {
  it("reduz imagens grandes para caber, mantendo a proporção", () => {
    expect(fitSize({ width: 2000, height: 1000 }, 480, 360)).toEqual({ width: 480, height: 240 });
    expect(fitSize({ width: 1000, height: 2000 }, 480, 360)).toEqual({ width: 180, height: 360 });
  });

  it("não amplia imagem pequena", () => {
    expect(fitSize({ width: 100, height: 50 }, 480, 360)).toEqual({ width: 100, height: 50 });
  });

  it("tamanho natural inválido cai num padrão", () => {
    const s = fitSize({ width: 0, height: 0 }, 480, 360);
    expect(s.width).toBeGreaterThan(0);
    expect(s.height).toBeGreaterThan(0);
  });

  it("imagem usa o tamanho ajustado; vídeo sem tamanho fica em 16:9; áudio é uma barra", () => {
    expect(defaultSizeFor("image", { width: 2000, height: 1000 })).toEqual({ width: 480, height: 240 });
    expect(defaultSizeFor("video", null)).toEqual({ width: 480, height: 270 });
    expect(defaultSizeFor("audio", null)).toEqual({ width: 320, height: 64 });
  });
});

describe("corte: caixa completa e área de origem", () => {
  it("sem corte, a imagem inteira é a origem e a caixa completa é a do elemento", () => {
    const el = img();
    expect(sourceRect(el)).toEqual({ sx: 0, sy: 0, sw: 1000, sh: 500 });
    expect(fullBounds(el)).toEqual({ x: 0, y: 0, width: 500, height: 250 });
  });

  it("com corte, a origem é a região cortada e a caixa completa se estende além do elemento", () => {
    const el = img({ x: 100, y: 50, width: 250, height: 125, crop: { x: 200, y: 100, width: 500, height: 250 } }); // escala 0,5
    expect(sourceRect(el)).toEqual({ sx: 200, sy: 100, sw: 500, sh: 250 });
    expect(fullBounds(el)).toEqual({ x: 0, y: 0, width: 500, height: 250 });
  });
});

describe("cropResize: arrastar uma alça no modo de corte", () => {
  it("lado direito para dentro: corta a direita; a escala não muda", () => {
    const out = cropResize(img(), "e", -100, 0);
    expect(out).toMatchObject({ x: 0, y: 0, width: 400, height: 250 });
    expect(out.crop).toEqual({ x: 0, y: 0, width: 800, height: 500 });
  });

  it("lado esquerdo para dentro: corta a esquerda e o elemento anda junto", () => {
    const out = cropResize(img(), "w", 100, 0);
    expect(out).toMatchObject({ x: 100, width: 400 });
    expect(out.crop).toEqual({ x: 200, y: 0, width: 800, height: 500 });
  });

  it("canto: corta dois lados de uma vez", () => {
    const out = cropResize(img(), "se", -50, -25);
    expect(out).toMatchObject({ width: 450, height: 225 });
    expect(out.crop).toEqual({ x: 0, y: 0, width: 900, height: 450 });
  });

  it("não deixa o corte passar das bordas da imagem", () => {
    const out = cropResize(img(), "e", 300, 0); // tentou crescer além da imagem inteira
    expect(out.width).toBe(500);
    expect(out.crop!.width).toBe(1000);
  });

  it("depois de cortado, dá para voltar a abrir até a borda original, nunca além", () => {
    const cut = cropResize(img(), "e", -200, 0); // largura 300
    const back = cropResize(cut, "e", 999, 0);
    expect(back.width).toBe(500);
    expect(back.crop!.width).toBe(1000);
  });

  it("tamanho mínimo: não inverte nem some", () => {
    const out = cropResize(img(), "e", -9999, 0);
    expect(out.width).toBeGreaterThanOrEqual(16);
    expect(out.crop!.width).toBeGreaterThan(0);
  });

  it("não altera o elemento original", () => {
    const el = img();
    cropResize(el, "e", -100, 0);
    expect(el.width).toBe(500);
    expect(el.crop).toBeUndefined();
  });

  it("respeita um corte anterior em x (lado esquerdo não vai além da borda da imagem)", () => {
    const el = img({ x: 100, width: 400, crop: { x: 200, y: 0, width: 800, height: 500 } });
    const out = cropResize(el, "w", -999, 0);
    expect(out.x).toBe(0);
    expect(out.crop!.x).toBe(0);
    expect(out.width).toBe(500);
  });
});

describe("cropResize com a imagem espelhada", () => {
  it("espelhada na horizontal, a alça direita da tela corta o lado ESQUERDO da imagem original", () => {
    const out = cropResize(img({ flipX: true }), "e", -100, 0);
    expect(out).toMatchObject({ x: 0, width: 400 });
    expect(out.crop).toEqual({ x: 200, y: 0, width: 800, height: 500 });
  });

  it("espelhada na horizontal, a alça esquerda da tela corta o lado DIREITO da imagem original e a caixa anda junto", () => {
    const out = cropResize(img({ flipX: true }), "w", 100, 0);
    expect(out).toMatchObject({ x: 100, width: 400 });
    expect(out.crop).toEqual({ x: 0, y: 0, width: 800, height: 500 });
  });

  it("espelhada na vertical, a alça de cima da tela corta a base da imagem original", () => {
    const out = cropResize(img({ flipY: true }), "n", 0, 50);
    expect(out).toMatchObject({ y: 50, height: 200 });
    expect(out.crop).toEqual({ x: 0, y: 0, width: 1000, height: 400 });
  });
});

describe("resetCrop / toggleFlip", () => {
  it("remover o corte devolve a imagem inteira, na mesma escala", () => {
    const cut = cropResize(img(), "w", 100, 0);
    const reset = resetCrop(cut);
    expect(reset.crop).toBeUndefined();
    expect(reset).toMatchObject({ x: 0, y: 0, width: 500, height: 250 });
  });

  it("espelhada, remover o corte também devolve a imagem inteira ao lugar certo", () => {
    const cut = cropResize(img({ flipX: true }), "e", -100, 0); // a borda direita da tela some: x=0, largura 400
    const reset = resetCrop(cut);
    expect(reset).toMatchObject({ x: 0, width: 500, height: 250 });
    const cutLeft = cropResize(img({ flipX: true }), "w", 100, 0); // a borda esquerda da tela some: caixa vai para x=100
    expect(cutLeft.x).toBe(100);
    expect(resetCrop(cutLeft)).toMatchObject({ x: 0, width: 500 });
  });

  it("sem corte nada muda", () => {
    const el = img();
    expect(resetCrop(el)).toBe(el);
  });

  it("espelhar liga e desliga cada eixo, sem mexer no outro", () => {
    const a = toggleFlip(img(), "x");
    expect(a.flipX).toBe(true);
    expect(a.flipY).toBeFalsy();
    expect(toggleFlip(a, "x").flipX).toBeFalsy();
    expect(toggleFlip(a, "y")).toMatchObject({ flipX: true, flipY: true });
  });
});
