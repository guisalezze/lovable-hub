import { useCallback, useEffect, useState, type RefObject } from "react";

/**
 * Modo apresentação: esconde as barras e pede tela cheia ao navegador (útil para gravar aulas).
 * Usa a Fullscreen API em vez de `position: fixed`, porque a animação de entrada das páginas do CRM
 * (`.page-enter`) pode criar um contexto de empilhamento que quebra o `fixed`.
 * Se o navegador negar ou não tiver tela cheia, o modo continua valendo só com as barras escondidas.
 */
export function usePresentationMode(rootRef: RefObject<HTMLElement>) {
  const [active, setActive] = useState(false);

  const enter = useCallback(async () => {
    setActive(true);
    try {
      await rootRef.current?.requestFullscreen?.();
    } catch {
      /* negado ou sem suporte: segue sem tela cheia */
    }
  }, [rootRef]);

  const exit = useCallback(async () => {
    setActive(false);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      /* já saiu */
    }
  }, []);

  // Esc na tela cheia é tratado pelo navegador: ele só avisa por este evento
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setActive(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  return { active, enter, exit };
}
