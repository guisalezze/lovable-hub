import { useEffect, useRef } from "react";
import { AlignCenter, AlignLeft, AlignRight, Bold, Highlighter, Italic, Strikethrough, Underline } from "lucide-react";
import { cn } from "@/lib/utils";
import { FONT_FAMILIES } from "@/lib/whiteboard/layout";
import { FONT_SIZES } from "@/lib/whiteboard/palette";
import { DEFAULT_HIGHLIGHT, elementRuns, htmlFromRuns, listContinuation, plainFromRuns, runsFromDom, trimRunsEnd } from "@/lib/whiteboard/richtext";
import { NOTE_PADDING, SHAPE_PADDING, textMaxWidth } from "@/lib/whiteboard/textblock";
import { TEXT_LINE_HEIGHT } from "@/lib/whiteboard/text";
import { resolveColor, type ThemeColors } from "@/lib/whiteboard/theme";
import type { Camera, FontFamily, StylePatch, TextAlign, TextRun, WbElement } from "@/lib/whiteboard/types";

type TextStylePatch = Pick<StylePatch, "fontSize" | "fontFamily" | "textAlign">;

interface Props {
  /** Elemento em edição (o pai o atualiza quando a fonte, o tamanho ou o alinhamento mudam). */
  element: WbElement;
  /** Câmera no instante em que a edição começou: o campo fica onde o texto vai aparecer. */
  camera: Camera;
  theme: ThemeColors;
  onCommit: (runs: TextRun[]) => void;
  onStyle: (patch: TextStylePatch) => void;
}

const FAMILY_BUTTONS: { family: FontFamily; label: string }[] = [
  { family: "sans", label: "Sem serifa" },
  { family: "serif", label: "Com serifa" },
  { family: "mono", label: "Monoespaçada" },
  { family: "hand", label: "Manuscrita" },
];
const ALIGN_BUTTONS: { align: TextAlign; label: string; icon: typeof AlignLeft }[] = [
  { align: "left", label: "Alinhar à esquerda", icon: AlignLeft },
  { align: "center", label: "Centralizar", icon: AlignCenter },
  { align: "right", label: "Alinhar à direita", icon: AlignRight },
];

const exec = (command: string, value?: string): boolean => {
  if (typeof document.execCommand !== "function") return false;
  return document.execCommand(command, false, value);
};

/** rgb(r, g, b) → "#rrggbb" (para comparar com a cor do marca-texto). */
const hexOf = (rgb: string): string => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
  return m ? `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}` : rgb.toLowerCase();
};

function toggleHighlight() {
  const current = typeof document.queryCommandValue === "function" ? document.queryCommandValue("hiliteColor") : "";
  const on = hexOf(String(current)) === DEFAULT_HIGHLIGHT;
  const color = on ? "transparent" : DEFAULT_HIGHLIGHT;
  if (!exec("hiliteColor", color)) exec("backColor", color);
}

/**
 * Campo de texto por cima do canvas, com formatação ao vivo (contenteditable).
 * Esc ou Ctrl+Enter ou clicar fora confirma; Enter quebra a linha (e continua listas "- " e "1. ").
 * Fica dentro do elemento do quadro, então os atalhos do quadro (que ignoram campos de texto) não disparam aqui.
 */
export function RichTextEditor({ element, camera, theme, onCommit, onStyle }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(false);
  const touchedRef = useRef(false);
  const startedAtRef = useRef(0);

  const z = camera.zoom;
  const fontSize = element.fontSize ?? 24;
  const family = element.fontFamily ?? "sans";
  const isFree = element.type === "text";
  const isNote = element.type === "note";
  const align = element.textAlign ?? (isFree || isNote ? "left" : "center");
  const color = resolveColor(element.strokeColor, theme);

  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.innerHTML = htmlFromRuns(elementRuns(element));
    startedAtRef.current = Date.now();
    // O foco entra um instante depois: ao clicar no canvas, o navegador ainda vai focar o quadro (que tem tabIndex)
    // logo após o clique, e isso tiraria o foco do campo recém-aberto.
    const timer = setTimeout(() => {
      ed.focus();
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(ed);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }, 0);
    return () => clearTimeout(timer);
    // só na abertura: depois disso o conteúdo é do campo, não do React
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    const ed = editorRef.current;
    onCommit(ed ? trimRunsEnd(runsFromDom(ed)) : []);
  };

  // Perder o foco logo depois de abrir, antes de a pessoa mexer em qualquer coisa, é o navegador mexendo no foco
  // (e não um clique fora): retoma o foco em vez de confirmar. Ir para a barra de formatação também não confirma.
  const onBlur = (e: React.FocusEvent) => {
    if (e.relatedTarget && toolbarRef.current?.contains(e.relatedTarget as Node)) return;
    if (!touchedRef.current && Date.now() - startedAtRef.current < 300) {
      setTimeout(() => editorRef.current?.focus(), 0);
      return;
    }
    finish();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    touchedRef.current = true;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === "Escape" || (e.key === "Enter" && mod)) {
      e.preventDefault();
      finish();
      return;
    }
    if (mod && e.shiftKey && e.key.toLowerCase() === "x") {
      e.preventDefault();
      exec("strikeThrough");
      return;
    }
    if (mod && e.shiftKey && e.key.toLowerCase() === "h") {
      e.preventDefault();
      toggleHighlight();
      return;
    }
    if (e.key === "Enter" && !mod && !e.shiftKey) continueList(e);
  };

  /** Enter numa lista ("- item", "3. item"): o próximo item já vem com o marcador; item vazio encerra a lista. */
  const continueList = (e: React.KeyboardEvent) => {
    const ed = editorRef.current;
    const sel = window.getSelection();
    if (!ed || !sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return;
    const upToCaret = document.createRange();
    upToCaret.selectNodeContents(ed);
    upToCaret.setEnd(range.endContainer, range.endOffset);
    const before = plainFromRuns(runsFromDom(upToCaret.cloneContents()));
    const action = listContinuation(before.slice(before.lastIndexOf("\n") + 1));
    if (!action) return;
    e.preventDefault();
    if (action.action === "end") {
      for (let i = 0; i < action.length; i++) exec("delete");
    } else {
      exec("insertParagraph");
      exec("insertText", action.marker);
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    // só texto: HTML colado de fora traria estilos e estruturas que o quadro não entende
    e.preventDefault();
    exec("insertText", e.clipboardData.getData("text/plain"));
  };

  const keepSelection = (e: React.MouseEvent) => e.preventDefault(); // clicar na barra não tira o foco do texto
  const fmt = (command: string) => () => {
    touchedRef.current = true;
    exec(command);
  };

  // posição na tela
  const left = (element.x - camera.x) * z;
  const top = (element.y - camera.y) * z;
  const boxW = element.width * z;
  const boxH = element.height * z;
  const innerW = textMaxWidth(element) * z;
  const pad = (isNote ? NOTE_PADDING : SHAPE_PADDING) * z;

  const editorStyle: React.CSSProperties = {
    fontFamily: FONT_FAMILIES[family],
    fontSize: fontSize * z,
    lineHeight: TEXT_LINE_HEIGHT,
    color,
    caretColor: color,
    textAlign: align,
    outline: `1px dashed ${theme.selection}`,
    outlineOffset: 3,
    background: "transparent",
    minHeight: fontSize * z * TEXT_LINE_HEIGHT,
    pointerEvents: "auto",
    whiteSpace: isFree ? "pre" : "pre-wrap",
    overflowWrap: isFree ? "normal" : "anywhere",
    ...(isFree ? { minWidth: fontSize * z } : { width: innerW }),
  };

  const wrapperStyle: React.CSSProperties = isFree
    ? { position: "absolute", left, top, zIndex: 20 }
    : {
        position: "absolute",
        left,
        top,
        width: boxW,
        height: boxH,
        zIndex: 20,
        display: "flex",
        justifyContent: "center",
        alignItems: isNote ? "flex-start" : "center",
        paddingTop: isNote ? pad : 0,
        pointerEvents: "none",
      };

  const btn = "flex h-7 w-7 items-center justify-center rounded text-foreground hover:bg-accent";

  return (
    <>
      <div style={wrapperStyle}>
        <div
          ref={editorRef}
          role="textbox"
          aria-label="Texto do quadro"
          aria-multiline="true"
          contentEditable
          suppressContentEditableWarning
          tabIndex={0}
          spellCheck={false}
          onInput={() => {
            touchedRef.current = true;
          }}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          style={editorStyle}
        />
      </div>

      <div
        ref={toolbarRef}
        onMouseDown={keepSelection}
        role="toolbar"
        aria-label="Formatação do texto"
        style={{ position: "absolute", left: Math.max(8, left), top: Math.max(8, top - 46), zIndex: 30 }}
        className="flex items-center gap-0.5 rounded-lg border border-border bg-card/95 p-1 shadow-md backdrop-blur"
      >
        <button type="button" className={btn} aria-label="Negrito" title="Negrito (Ctrl+B)" onClick={fmt("bold")}>
          <Bold className="h-4 w-4" />
        </button>
        <button type="button" className={btn} aria-label="Itálico" title="Itálico (Ctrl+I)" onClick={fmt("italic")}>
          <Italic className="h-4 w-4" />
        </button>
        <button type="button" className={btn} aria-label="Sublinhado" title="Sublinhado (Ctrl+U)" onClick={fmt("underline")}>
          <Underline className="h-4 w-4" />
        </button>
        <button type="button" className={btn} aria-label="Tachado" title="Tachado (Ctrl+Shift+X)" onClick={fmt("strikeThrough")}>
          <Strikethrough className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={btn}
          aria-label="Marca-texto"
          title="Marca-texto (Ctrl+Shift+H)"
          onClick={() => {
            touchedRef.current = true;
            toggleHighlight();
          }}
        >
          <Highlighter className="h-4 w-4" />
        </button>
        <div className="mx-1 h-5 w-px bg-border" />
        {FAMILY_BUTTONS.map((f) => (
          <button
            key={f.family}
            type="button"
            className={cn(btn, family === f.family && "bg-primary/15 text-primary")}
            aria-label={`Fonte ${f.label}`}
            aria-pressed={family === f.family}
            title={f.label}
            style={{ fontFamily: FONT_FAMILIES[f.family] }}
            onClick={() => onStyle({ fontFamily: f.family })}
          >
            Aa
          </button>
        ))}
        <div className="mx-1 h-5 w-px bg-border" />
        {ALIGN_BUTTONS.map((a) => (
          <button
            key={a.align}
            type="button"
            className={cn(btn, align === a.align && "bg-primary/15 text-primary")}
            aria-label={a.label}
            aria-pressed={align === a.align}
            title={a.label}
            onClick={() => onStyle({ textAlign: a.align })}
          >
            <a.icon className="h-4 w-4" />
          </button>
        ))}
        <div className="mx-1 h-5 w-px bg-border" />
        {FONT_SIZES.map((size, i) => (
          <button
            key={size}
            type="button"
            className={cn(btn, fontSize === size && "bg-primary/15 text-primary")}
            aria-label={`Letra ${["pequena", "média", "grande", "muito grande"][i]}`}
            aria-pressed={fontSize === size}
            onClick={() => onStyle({ fontSize: size })}
          >
            <span className="font-semibold leading-none" style={{ fontSize: 9 + i * 3 }}>
              A
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
