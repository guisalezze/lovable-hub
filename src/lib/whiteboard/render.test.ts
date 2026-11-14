import { describe, it, expect, afterEach } from "vitest";
import { readThemeColors, resolveColor } from "./theme";
import type { ThemeColors } from "./theme";
import { freedrawPath } from "./render";

const theme: ThemeColors = { background: "hsl(0 0% 4%)", foreground: "hsl(60 20% 95%)", grid: "hsl(0 0% 15%)", selection: "hsl(46 65% 52%)" };

describe("resolveColor", () => {
  it("auto vira a cor de texto do tema", () => {
    expect(resolveColor("auto", theme)).toBe(theme.foreground);
  });
  it("cor fixa passa direto", () => {
    expect(resolveColor("#ff0000", theme)).toBe("#ff0000");
  });
});

describe("readThemeColors", () => {
  afterEach(() => {
    document.documentElement.style.removeProperty("--background");
  });

  it("monta hsl() a partir do token do CRM", () => {
    document.documentElement.style.setProperty("--background", "0 0% 4%");
    expect(readThemeColors().background).toBe("hsl(0 0% 4%)");
  });

  it("sem token definido ainda devolve cores usáveis", () => {
    const t = readThemeColors();
    for (const v of Object.values(t)) expect(v).toMatch(/^hsl\(/);
  });
});

describe("freedrawPath", () => {
  it("sem pontos devolve string vazia", () => {
    expect(freedrawPath([], 4)).toBe("");
  });
  it("com um ponto devolve um caminho SVG", () => {
    expect(freedrawPath([[10, 10]], 4)).toMatch(/^M/);
  });
  it("com vários pontos devolve um caminho fechado", () => {
    const d = freedrawPath([[0, 0], [10, 5], [20, 0]], 4);
    expect(d).toMatch(/^M/);
    expect(d.trim().endsWith("Z")).toBe(true);
  });
});
