import { useEffect, useRef } from "react";
import { FONT_FAMILY, TEXT_LINE_HEIGHT, measureText } from "@/lib/whiteboard/text";
import { resolveColor, type ThemeColors } from "@/lib/whiteboard/theme";
import type { Camera, WbElement } from "@/lib/whiteboard/types";

interface Props {
  /** Texto que está sendo escrito (estado no instante em que a edição começou). */
  element: WbElement;
  /** Câmera nesse mesmo instante: o campo fica no lugar onde o texto vai aparecer. */
  camera: Camera;
  theme: ThemeColors;
  onCommit: (text: string) => void;
}

/**
 * Campo de texto por cima do canvas. Enter quebra a linha; Esc ou clicar fora confirma.
 * Fica dentro do elemento do quadro, então os atalhos do quadro (que ignoram campos de texto) não disparam aqui.
 */
export function TextEditor({ element, camera, theme, onCommit }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const doneRef = useRef(false);
  const touchedRef = useRef(false);
  const startedAtRef = useRef(0);
  const fontSize = element.fontSize ?? 24;
  const px = fontSize * camera.zoom;

  const fit = () => {
    const ta = ref.current;
    if (!ta) return;
    const m = measureText(ta.value || " ", fontSize);
    ta.style.width = `${Math.max(m.width * camera.zoom + px, px * 3)}px`; // folga de uma letra para quem está digitando
    ta.style.height = `${Math.max(m.height * camera.zoom, px * TEXT_LINE_HEIGHT)}px`;
  };

  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.value = element.text ?? "";
    fit();
    startedAtRef.current = Date.now();
    // O foco entra um instante depois: ao clicar no canvas, o navegador ainda vai focar o quadro (que tem tabIndex)
    // logo após o clique, e isso tiraria o foco do campo recém-aberto.
    const timer = setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Perder o foco logo depois de abrir, antes de a pessoa digitar qualquer coisa, é o navegador mexendo no foco
  // (e não um clique fora): retoma o foco em vez de confirmar um texto vazio.
  const onBlur = () => {
    if (!touchedRef.current && Date.now() - startedAtRef.current < 300) {
      setTimeout(() => ref.current?.focus(), 0);
      return;
    }
    finish();
  };

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCommit(ref.current?.value ?? "");
  };

  return (
    <textarea
      ref={ref}
      aria-label="Texto do quadro"
      spellCheck={false}
      onInput={() => {
        touchedRef.current = true;
        fit();
      }}
      onBlur={onBlur}
      onKeyDown={(e) => {
        touchedRef.current = true;
        if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          finish();
        }
      }}
      style={{
        position: "absolute",
        left: (element.x - camera.x) * camera.zoom,
        top: (element.y - camera.y) * camera.zoom,
        margin: 0,
        padding: 0,
        border: "none",
        outline: `1px dashed ${theme.selection}`,
        outlineOffset: 3,
        background: "transparent",
        resize: "none",
        overflow: "hidden",
        whiteSpace: "pre",
        fontFamily: FONT_FAMILY,
        fontSize: px,
        lineHeight: TEXT_LINE_HEIGHT,
        color: resolveColor(element.strokeColor, theme),
        caretColor: resolveColor(element.strokeColor, theme),
        zIndex: 20,
      }}
    />
  );
}
