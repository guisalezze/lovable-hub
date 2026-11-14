import { describe, it, expect } from "vitest";
import { exportToSvg, exportFileName } from "./export";
import { createElement } from "./scene";
import type { ThemeColors } from "./theme";

const theme: ThemeColors = {
  background: "hsl(0 0% 4%)",
  foreground: "hsl(60 20% 95%)",
  grid: "hsl(0 0% 15%)",
  selection: "hsl(46 65% 52%)",
};

const rect = (x = 100, y = 100, extra = {}) => createElement("rectangle", x, y, { width: 40, height: 20, ...extra });

function parse(svg: string) {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  return { doc, error: doc.querySelector("parsererror") };
}

describe("exportToSvg", () => {
  it("gera um SVG válido para duas formas", () => {
    const svg = exportToSvg([rect(), createElement("ellipse", 200, 100, { width: 50, height: 30 })], { theme, background: true });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("viewBox=");
    expect(parse(svg).error).toBeNull();
  });

  it("o viewBox é a caixa do conteúdo mais o preenchimento", () => {
    const svg = exportToSvg([rect(100, 100)], { theme, background: false, padding: 16 });
    const doc = parse(svg).doc.documentElement;
    expect(doc.getAttribute("viewBox")).toBe("84 84 72 52");
    expect(doc.getAttribute("width")).toBe("72");
    expect(doc.getAttribute("height")).toBe("52");
  });

  it("a cor automática vira a cor do tema (nada de stroke=\"auto\" no arquivo)", () => {
    const svg = exportToSvg([rect()], { theme, background: false });
    expect(svg).not.toContain("auto");
    expect(svg).toContain(theme.foreground);
  });

  it("com fundo desenha o retângulo de fundo; sem fundo, não", () => {
    const withBg = exportToSvg([rect()], { theme, background: true });
    const withoutBg = exportToSvg([rect()], { theme, background: false });
    expect(withBg).toContain(`fill="${theme.background}"`);
    expect(withoutBg).not.toContain(theme.background);
  });

  it("o traço de lápis vira um path preenchido", () => {
    const pencil = createElement("freedraw", 10, 10, { points: [[0, 0], [20, 10], [40, 0]], strokeColor: "#e03131" });
    const svg = exportToSvg([pencil], { theme, background: false });
    expect(svg).toContain("<path");
    expect(svg).toContain('fill="#e03131"');
  });

  it("elemento girado entra inteiro na caixa", () => {
    const turned = { ...createElement("rectangle", 0, 0, { width: 100, height: 20 }), angle: Math.PI / 2 };
    const svg = exportToSvg([turned], { theme, background: false, padding: 16 });
    // girado 90°: ocupa 20 de largura e 100 de altura, centrado em (50, 10)
    expect(parse(svg).doc.documentElement.getAttribute("viewBox")).toBe("24 -56 52 132");
  });

  it("seta e linha também saem no arquivo", () => {
    const arrow = createElement("arrow", 0, 0, { points: [[0, 0], [100, 50]] });
    const line = createElement("line", 0, 100, { points: [[0, 0], [100, 0]] });
    const svg = exportToSvg([arrow, line], { theme, background: false });
    expect(parse(svg).error).toBeNull();
    expect((svg.match(/<path/g) ?? []).length).toBeGreaterThanOrEqual(3); // linha + seta (corpo e ponta)
  });

  it("sem elementos avisa com uma mensagem clara", () => {
    expect(() => exportToSvg([], { theme, background: true })).toThrow("Nada para exportar");
  });

  it("elementos de tamanho zero não quebram o enquadramento", () => {
    const dot = createElement("freedraw", 5, 5, { points: [[0, 0]] });
    const svg = exportToSvg([dot], { theme, background: false });
    expect(parse(svg).error).toBeNull();
    const [, , w, h] = parse(svg).doc.documentElement.getAttribute("viewBox")!.split(" ").map(Number);
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
  });
});

describe("exportFileName", () => {
  it("usa o título do quadro e a extensão", () => {
    expect(exportFileName("Funil de vendas", "png")).toBe("Funil de vendas.png");
  });

  it("tira caracteres que o sistema de arquivos não aceita", () => {
    expect(exportFileName('Aula 1: "intro" / parte 2?', "svg")).toBe("Aula 1 intro parte 2.svg");
  });

  it("título vazio vira 'quadro'", () => {
    expect(exportFileName("   ", "png")).toBe("quadro.png");
    expect(exportFileName("///", "png")).toBe("quadro.png");
  });
});
