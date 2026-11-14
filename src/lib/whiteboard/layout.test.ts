import { describe, it, expect } from "vitest";
import { layoutText, fontString, FONT_FAMILIES, type FontSpec } from "./layout";
import type { TextRun } from "./types";

// medida falsa e previsível: 0,5 do tamanho da fonte por letra (+1 por letra em negrito)
const measure = (text: string, f: FontSpec) => text.length * f.size * 0.5 + (f.bold ? text.length : 0);
const base = { fontSize: 10, measure };
const lay = (runs: TextRun[] | string, extra: Record<string, unknown> = {}) =>
  layoutText(typeof runs === "string" ? [{ text: runs }] : runs, { ...base, ...extra });
const lineTexts = (l: ReturnType<typeof layoutText>) => l.lines.map((ln) => ln.segments.map((s) => s.text).join(""));

describe("layoutText: linhas", () => {
  it("uma linha: largura e altura", () => {
    const l = lay("abc");
    expect(l.lines).toHaveLength(1);
    expect(l.width).toBe(15);
    expect(l.height).toBeCloseTo(12.5); // 10 * 1,25
  });

  it("quebra de linha cria linhas; linha vazia mantém a altura", () => {
    const l = lay("a\n\nb");
    expect(lineTexts(l)).toEqual(["a", "", "b"]);
    expect(l.height).toBeCloseTo(37.5);
    expect(l.lines.map((x) => x.y)).toEqual([0, 12.5, 25]);
  });

  it("texto vazio é uma linha vazia (dá para clicar e editar)", () => {
    const l = layoutText([], base);
    expect(l.lines).toHaveLength(1);
    expect(l.height).toBeCloseTo(12.5);
  });

  it("a largura sem limite é a da linha mais comprida", () => {
    expect(lay("ab\nabcdef\nabc").width).toBe(30);
  });
});

describe("layoutText: quebra automática", () => {
  it("quebra nos espaços quando passa da largura", () => {
    const l = lay("aaaa bbbb cccc", { maxWidth: 50 }); // 10 letras por linha
    expect(lineTexts(l)).toEqual(["aaaa bbbb", "cccc"]);
    expect(l.width).toBe(50);
  });

  it("espaços do fim da linha quebrada não contam nem aparecem", () => {
    const l = lay("aaaaa bbbbb", { maxWidth: 25 });
    expect(lineTexts(l)).toEqual(["aaaaa", "bbbbb"]);
    expect(l.lines[0].width).toBe(25);
  });

  it("palavra maior que a largura fica sozinha na linha, sem travar", () => {
    const l = lay("aa bbbbbbbbbbbbbbbb cc", { maxWidth: 30 });
    expect(lineTexts(l)).toEqual(["aa", "bbbbbbbbbbbbbbbb", "cc"]);
  });

  it("não quebra se couber exatamente", () => {
    expect(lineTexts(lay("aaaa bbbb", { maxWidth: 45 }))).toEqual(["aaaa bbbb"]);
  });

  it("respeita quebras manuais junto com a automática", () => {
    expect(lineTexts(lay("aaaa bbbb\ncc", { maxWidth: 30 }))).toEqual(["aaaa", "bbbb", "cc"]);
  });
});

describe("layoutText: estilos", () => {
  it("trechos com estilos diferentes na mesma linha mantêm o estilo e a posição", () => {
    const l = lay([{ text: "ab" }, { text: "cd", bold: true }, { text: "ef" }]);
    const segs = l.lines[0].segments;
    expect(segs.map((s) => s.text)).toEqual(["ab", "cd", "ef"]);
    expect(segs[1].style.bold).toBe(true);
    expect(segs[0].x).toBe(0);
    expect(segs[1].x).toBe(10); // depois de "ab" (2 letras * 5)
    expect(segs[2].x).toBe(10 + segs[1].width);
  });

  it("negrito é medido com a fonte em negrito", () => {
    expect(lay([{ text: "abc", bold: true }]).width).toBe(18); // 3*5 + 3
  });

  it("trechos vizinhos com o mesmo estilo viram um segmento só", () => {
    const l = lay([{ text: "ab" }, { text: "cd" }]);
    expect(l.lines[0].segments).toHaveLength(1);
  });

  it("o estilo atravessa a quebra automática de linha", () => {
    const l = lay([{ text: "aaaa bbbb cccc", underline: true }], { maxWidth: 50 });
    expect(l.lines.every((ln) => ln.segments.every((s) => s.style.underline))).toBe(true);
  });

  it("fontString monta a fonte para o canvas", () => {
    expect(fontString({ size: 20, family: "sans", bold: true, italic: true })).toBe(`italic 700 20px ${FONT_FAMILIES.sans}`);
    expect(fontString({ size: 12, family: "mono", bold: false, italic: false })).toBe(`12px ${FONT_FAMILIES.mono}`);
  });
});

describe("layoutText: alinhamento", () => {
  it("centro e direita deslocam cada linha dentro da largura", () => {
    const left = lay("ab\nabcd", { maxWidth: 40, align: "left" });
    const center = lay("ab\nabcd", { maxWidth: 40, align: "center" });
    const right = lay("ab\nabcd", { maxWidth: 40, align: "right" });
    expect(left.lines[0].segments[0].x).toBe(0);
    expect(center.lines[0].segments[0].x).toBe(15); // (40 - 10) / 2
    expect(right.lines[0].segments[0].x).toBe(30); // 40 - 10
    expect(center.lines[1].segments[0].x).toBe(10); // (40 - 20) / 2
  });

  it("sem largura máxima, alinha dentro da linha mais comprida", () => {
    const center = lay("ab\nabcdef", { align: "center" });
    expect(center.lines[0].segments[0].x).toBe(10); // (30 - 10) / 2
  });
});

describe("layoutText: listas", () => {
  it("'- ' vira marcador e o texto fica recuado", () => {
    const l = lay("- item");
    expect(l.lines[0].marker).toBe("•");
    expect(lineTexts(l)).toEqual(["item"]);
    expect(l.lines[0].segments[0].x).toBeGreaterThan(0);
    expect(l.lines[0].indent).toBeGreaterThan(0);
  });

  it("numeração automática e reinício depois de uma linha comum", () => {
    const l = lay("1. a\n1. b\nsolta\n7. c");
    expect(l.lines.map((x) => x.marker)).toEqual(["1.", "2.", undefined, "1."]);
    expect(lineTexts(l)).toEqual(["a", "b", "solta", "c"]);
  });

  it("item comprido quebra com recuo (o texto de baixo alinha com o de cima)", () => {
    const l = lay("- aaaa bbbb cccc", { maxWidth: 60 });
    expect(l.lines.length).toBeGreaterThan(1);
    expect(l.lines[0].marker).toBe("•");
    expect(l.lines[1].marker).toBeUndefined();
    expect(l.lines[1].segments[0].x).toBe(l.lines[0].segments[0].x);
  });

  it("o marcador some do texto mesmo quando o prefixo atravessa trechos", () => {
    const l = lay([{ text: "-" }, { text: " item", bold: true }]);
    expect(l.lines[0].marker).toBe("•");
    expect(lineTexts(l)).toEqual(["item"]);
  });

  it("hífen sem espaço depois não é lista", () => {
    const l = lay("-item");
    expect(l.lines[0].marker).toBeUndefined();
    expect(lineTexts(l)).toEqual(["-item"]);
  });

  it("'• ' digitado também vale", () => {
    expect(lay("• item").lines[0].marker).toBe("•");
  });

  it("a lista entra na largura do bloco", () => {
    expect(lay("- ab").width).toBe(lay("ab").width + lay("- ab").lines[0].indent);
  });
});

describe("layoutText: robustez", () => {
  it("largura máxima zero ou negativa não gera laço infinito", () => {
    const l = lay("aaa bbb", { maxWidth: 0 });
    expect(l.lines.length).toBeGreaterThan(0);
    expect(Number.isFinite(l.height)).toBe(true);
  });

  it("muito texto não trava", () => {
    const l = lay("palavra ".repeat(2000), { maxWidth: 200 });
    expect(l.lines.length).toBeGreaterThan(100);
  });

  it("tamanho de fonte inválido vira 1", () => {
    const l = layoutText([{ text: "ab" }], { fontSize: 0, measure });
    expect(Number.isFinite(l.width) && Number.isFinite(l.height)).toBe(true);
  });
});
