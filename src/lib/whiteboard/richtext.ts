import type { TextRun, WbElement } from "./types";

/** Cor do marca-texto quando o campo editável não diz qual. */
export const DEFAULT_HIGHLIGHT = "#ffd43b";

type RunStyle = Omit<TextRun, "text">;

const sameStyle = (a: RunStyle, b: RunStyle) =>
  !!a.bold === !!b.bold &&
  !!a.italic === !!b.italic &&
  !!a.underline === !!b.underline &&
  !!a.strike === !!b.strike &&
  (a.highlight ?? "") === (b.highlight ?? "");

/** Só as marcas ligadas entram (nada de `bold: false`): é assim que o texto fica guardado. */
function cleanRun(text: string, s: RunStyle): TextRun {
  return {
    text,
    ...(s.bold ? { bold: true } : {}),
    ...(s.italic ? { italic: true } : {}),
    ...(s.underline ? { underline: true } : {}),
    ...(s.strike ? { strike: true } : {}),
    ...(s.highlight ? { highlight: s.highlight } : {}),
  };
}

/** Descarta trechos vazios e junta os vizinhos com o mesmo estilo. */
export function normalizeRuns(runs: TextRun[]): TextRun[] {
  const out: TextRun[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const last = out[out.length - 1];
    if (last && sameStyle(last, r)) last.text += r.text;
    else out.push(cleanRun(r.text, r));
  }
  return out;
}

export const plainFromRuns = (runs: TextRun[]): string => runs.map((r) => r.text).join("");

export const runsFromPlain = (text: string): TextRun[] => (text ? [{ text }] : []);

/** Trechos de um elemento: os com estilo, se houver; senão o texto simples. */
export function elementRuns(el: WbElement): TextRun[] {
  return el.runs ?? runsFromPlain(el.text ?? "");
}

/** Tira espaços e quebras de linha do fim do texto, mesmo atravessando trechos. */
export function trimRunsEnd(runs: TextRun[]): TextRun[] {
  const out = runs.map((r) => ({ ...r }));
  while (out.length > 0) {
    const last = out[out.length - 1];
    last.text = last.text.replace(/\s+$/, "");
    if (last.text === "") out.pop();
    else break;
  }
  return out;
}

// ---- do campo editável (DOM) para trechos --------------------------------

const BLOCKS = new Set(["DIV", "P", "LI", "UL", "OL", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE"]);

/** O navegador devolve cores como rgb(r, g, b): guardamos sempre em #rrggbb. Transparente = sem cor (null). */
export function toHexColor(color: string): string | null {
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(color.trim());
  if (!m) return color;
  if (m[4] !== undefined && Number(m[4]) === 0) return null;
  const hex = (n: string) => Math.min(255, Number(n)).toString(16).padStart(2, "0");
  return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
}

function styleFrom(parent: RunStyle, el: HTMLElement): RunStyle {
  const s: RunStyle = { ...parent };
  const tag = el.tagName;
  if (tag === "B" || tag === "STRONG") s.bold = true;
  if (tag === "I" || tag === "EM") s.italic = true;
  if (tag === "U") s.underline = true;
  if (tag === "S" || tag === "STRIKE" || tag === "DEL") s.strike = true;
  if (tag === "MARK") s.highlight = DEFAULT_HIGHLIGHT;

  const st = el.style;
  if (st) {
    const weight = st.fontWeight;
    if (weight === "bold" || weight === "bolder" || (weight && Number(weight) >= 600)) s.bold = true;
    if (st.fontStyle === "italic") s.italic = true;
    const deco = `${st.textDecoration ?? ""} ${st.textDecorationLine ?? ""}`;
    if (deco.includes("underline")) s.underline = true;
    if (deco.includes("line-through")) s.strike = true;
    const bg = st.backgroundColor;
    if (bg && bg !== "transparent" && bg !== "initial" && bg !== "inherit") {
      const hex = toHexColor(bg);
      if (hex) s.highlight = hex;
    }
  }
  return s;
}

/**
 * Lê o que o campo editável (contenteditable) produziu. O navegador escreve a primeira linha solta e as
 * seguintes em <div> (linha vazia = <div><br></div>); <br> solto quebra a linha. A quebra de linha herda o
 * estilo do fim da linha anterior, então trechos com o mesmo estilo continuam juntos.
 */
export function runsFromDom(root: Node): TextRun[] {
  const lines: TextRun[][] = [[]];
  let blocksSeen = 0;
  const cur = () => lines[lines.length - 1];

  const visit = (node: Node, style: RunStyle) => {
    if (node.nodeType === 3) {
      const text = node.textContent ?? "";
      if (text) cur().push(cleanRun(text, style));
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as HTMLElement;
    if (el.tagName === "BR") {
      const parent = el.parentNode as HTMLElement | null;
      const placeholder = parent && parent.childNodes.length === 1; // <div><br></div> é só uma linha vazia
      if (!placeholder) lines.push([]);
      return;
    }
    if (BLOCKS.has(el.tagName)) {
      if (blocksSeen > 0 || cur().length > 0 || lines.length > 1) lines.push([]);
      blocksSeen++;
    }
    const next = styleFrom(style, el);
    el.childNodes.forEach((child) => visit(child, next));
  };
  root.childNodes.forEach((child) => visit(child, {}));

  const out: TextRun[] = [];
  lines.forEach((line, i) => {
    out.push(...line);
    if (i < lines.length - 1) {
      const last = line[line.length - 1];
      out.push(cleanRun("\n", last ?? {}));
    }
  });
  return normalizeRuns(out);
}

// ---- de trechos para o campo editável (HTML) -----------------------------

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const SAFE_COLOR = /^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%]+\)|[a-zA-Z]+)$/;

function runHtml(r: TextRun): string {
  let html = escapeHtml(r.text);
  if (r.highlight) {
    const color = SAFE_COLOR.test(r.highlight) ? r.highlight : DEFAULT_HIGHLIGHT;
    html = `<mark style="background-color: ${color}; color: inherit">${html}</mark>`;
  }
  if (r.strike) html = `<s>${html}</s>`;
  if (r.underline) html = `<u>${html}</u>`;
  if (r.italic) html = `<i>${html}</i>`;
  if (r.bold) html = `<b>${html}</b>`;
  return html;
}

/** Divide os trechos em linhas (cada uma, uma lista de trechos sem "\n"). */
export function splitRunsIntoLines(runs: TextRun[]): TextRun[][] {
  const lines: TextRun[][] = [[]];
  for (const r of runs) {
    r.text.split("\n").forEach((piece, i) => {
      if (i > 0) lines.push([]);
      if (piece) lines[lines.length - 1].push(cleanRun(piece, r));
    });
  }
  return lines;
}

/** HTML para abrir o campo editável com este texto (mesmo formato que o navegador produziria). */
export function htmlFromRuns(runs: TextRun[]): string {
  if (runs.length === 0) return "";
  const lines = splitRunsIntoLines(runs);
  return lines
    .map((line, i) => {
      const inner = line.map(runHtml).join("");
      if (i === 0 && lines.length === 1) return inner;
      if (i === 0 && inner !== "") return inner;
      return `<div>${inner || "<br>"}</div>`;
    })
    .join("");
}

/**
 * Enter dentro de uma lista: o que fazer, olhando o texto da linha até o cursor.
 * "- item" / "• item" / "3. item" continuam a lista; item vazio ("- ") encerra; linha comum: nada (null).
 */
export function listContinuation(lineBeforeCaret: string): { action: "continue"; marker: string } | { action: "end"; length: number } | null {
  const bullet = /^(- |• )(.*)$/.exec(lineBeforeCaret);
  if (bullet) return bullet[2] === "" ? { action: "end", length: bullet[1].length } : { action: "continue", marker: bullet[1] };
  const num = /^(\d+)\. (.*)$/.exec(lineBeforeCaret);
  if (num) return num[2] === "" ? { action: "end", length: num[1].length + 2 } : { action: "continue", marker: `${Number(num[1]) + 1}. ` };
  return null;
}
