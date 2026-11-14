import { describe, it, expect } from "vitest";
import { elementRuns, htmlFromRuns, normalizeRuns, plainFromRuns, runsFromDom, runsFromPlain, trimRunsEnd } from "./richtext";
import { createElement } from "./scene";
import type { TextRun } from "./types";

const dom = (html: string) => {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
};

describe("normalizeRuns / plainFromRuns / runsFromPlain", () => {
  it("junta trechos vizinhos com o mesmo estilo e descarta vazios", () => {
    const out = normalizeRuns([{ text: "a" }, { text: "b" }, { text: "" }, { text: "c", bold: true }, { text: "d", bold: true }]);
    expect(out).toEqual([{ text: "ab" }, { text: "cd", bold: true }]);
  });

  it("estilos diferentes não se juntam", () => {
    expect(normalizeRuns([{ text: "a", bold: true }, { text: "b", italic: true }])).toHaveLength(2);
    expect(normalizeRuns([{ text: "a", highlight: "#ffd43b" }, { text: "b", highlight: "#8ce99a" }])).toHaveLength(2);
  });

  it("false e ausente são o mesmo estilo", () => {
    expect(normalizeRuns([{ text: "a", bold: false }, { text: "b" }])).toEqual([{ text: "ab" }]);
  });

  it("texto puro de volta", () => {
    expect(plainFromRuns([{ text: "Olá " }, { text: "mundo", bold: true }])).toBe("Olá mundo");
    expect(plainFromRuns([])).toBe("");
  });

  it("de texto puro para trechos", () => {
    expect(runsFromPlain("a\nb")).toEqual([{ text: "a\nb" }]);
    expect(runsFromPlain("")).toEqual([]);
  });

  it("trimRunsEnd tira espaços e quebras do fim, mesmo atravessando trechos", () => {
    expect(trimRunsEnd([{ text: "a  " }, { text: "\n", bold: true }, { text: " \n" }])).toEqual([{ text: "a" }]);
    expect(trimRunsEnd([{ text: "  \n " }])).toEqual([]);
  });
});

describe("elementRuns", () => {
  it("usa os trechos quando existem; senão o texto simples", () => {
    const rich = createElement("text", 0, 0, { text: "ab", runs: [{ text: "a" }, { text: "b", bold: true }] });
    expect(elementRuns(rich)).toEqual([{ text: "a" }, { text: "b", bold: true }]);
    const plain = createElement("text", 0, 0, { text: "ola" });
    expect(elementRuns(plain)).toEqual([{ text: "ola" }]);
    expect(elementRuns(createElement("rectangle", 0, 0, {}))).toEqual([]);
  });
});

describe("runsFromDom: o que o campo editável produz", () => {
  it("negrito, itálico, sublinhado, tachado e marca-texto por tag", () => {
    const runs = runsFromDom(dom("<b>n</b><strong>N</strong><i>i</i><em>I</em><u>u</u><s>s</s><strike>S</strike><del>d</del><mark>m</mark>"));
    expect(runs).toEqual([
      { text: "nN", bold: true },
      { text: "iI", italic: true },
      { text: "u", underline: true },
      { text: "sSd", strike: true },
      { text: "m", highlight: "#ffd43b" },
    ]);
  });

  it("estilo em span (como o navegador escreve ao aplicar formatação)", () => {
    const runs = runsFromDom(
      dom('<span style="font-weight: 700">a</span><span style="font-style: italic">b</span><span style="text-decoration: underline line-through">c</span><span style="background-color: rgb(255, 168, 168)">d</span>'),
    );
    expect(runs).toEqual([
      { text: "a", bold: true },
      { text: "b", italic: true },
      { text: "c", underline: true, strike: true },
      { text: "d", highlight: "#ffa8a8" }, // o navegador diz rgb(...): guardamos em hex
    ]);
  });

  it("estilos aninhados se acumulam", () => {
    expect(runsFromDom(dom("<b><i>x</i>y</b>"))).toEqual([
      { text: "x", bold: true, italic: true },
      { text: "y", bold: true },
    ]);
  });

  it("linhas do Chrome: a primeira solta, as seguintes em <div>; linha vazia é <div><br></div>", () => {
    expect(plainFromRuns(runsFromDom(dom("a<div>b</div><div><br></div><div>c</div>")))).toBe("a\nb\n\nc");
  });

  it("começar por uma linha vazia", () => {
    expect(plainFromRuns(runsFromDom(dom("<div><br></div><div>b</div>")))).toBe("\nb");
  });

  it("<br> no meio do texto quebra a linha", () => {
    expect(plainFromRuns(runsFromDom(dom("a<br>b")))).toBe("a\nb");
  });

  it("parágrafos <p> também viram linhas", () => {
    expect(plainFromRuns(runsFromDom(dom("<p>a</p><p>b</p>")))).toBe("a\nb");
  });

  it("caracteres especiais ficam como texto, sem virar HTML", () => {
    expect(plainFromRuns(runsFromDom(dom("a &lt; b &amp; c &gt; d")))).toBe("a < b & c > d");
  });

  it("vazio vira nenhum trecho", () => {
    expect(runsFromDom(dom(""))).toEqual([]);
    expect(runsFromDom(dom("<br>"))).toEqual([]);
  });

  it("quebra de linha mantém o estilo das duas linhas", () => {
    const runs = runsFromDom(dom("<b>a</b><div><b>b</b></div>"));
    expect(runs).toEqual([{ text: "a\nb", bold: true }]); // a quebra herda o estilo e os trechos se juntam
  });
});

describe("htmlFromRuns", () => {
  const sample: TextRun[] = [
    { text: "Olá " },
    { text: "mundo", bold: true },
    { text: "\nsegunda ", italic: true, underline: true },
    { text: "linha", strike: true, highlight: "#ffd43b" },
    { text: "\n\nquarta" },
  ];

  it("ida e volta: o que sai do HTML é o que entrou", () => {
    const back = runsFromDom(dom(htmlFromRuns(sample)));
    expect(plainFromRuns(back)).toBe(plainFromRuns(sample));
    // os estilos de cada caractere voltam iguais (as quebras de linha herdam estilo, então comparamos só o texto visível)
    const visible = (runs: TextRun[]) => normalizeRuns(runs.map((r) => ({ ...r, text: r.text.replace(/\n/g, "") })));
    expect(visible(back)).toEqual(visible(sample));
  });

  it("escapa caracteres especiais", () => {
    const html = htmlFromRuns([{ text: "a < b & c > d" }]);
    expect(html).toContain("a &lt; b &amp; c &gt; d");
    expect(html).not.toContain("<b ");
    expect(plainFromRuns(runsFromDom(dom(html)))).toBe("a < b & c > d");
  });

  it("não deixa o texto virar HTML (proteção contra script)", () => {
    const html = htmlFromRuns([{ text: '<img src=x onerror="alert(1)">' }]);
    const root = dom(html);
    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent).toBe('<img src=x onerror="alert(1)">');
  });

  it("cor de marca-texto maliciosa não vira atributo solto", () => {
    const html = htmlFromRuns([{ text: "x", highlight: 'red" onclick="alert(1)' }]);
    expect(dom(html).querySelector("[onclick]")).toBeNull();
  });

  it("vazio gera HTML vazio", () => {
    expect(htmlFromRuns([])).toBe("");
  });
});
