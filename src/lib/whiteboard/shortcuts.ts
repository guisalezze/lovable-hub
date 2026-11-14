import type { Tool } from "./types";

export type ShortcutAction =
  | { kind: "tool"; tool: Tool }
  | { kind: "undo" }
  | { kind: "redo" }
  | { kind: "delete" }
  | { kind: "selectAll" }
  | { kind: "duplicate" }
  | { kind: "escape" }
  | { kind: "copy" }
  | { kind: "paste" }
  | { kind: "cut" }
  | { kind: "group" }
  | { kind: "ungroup" }
  | { kind: "lock" }
  | { kind: "forward" }
  | { kind: "backward" }
  | { kind: "front" }
  | { kind: "back" }
  | { kind: "presentation" };

const TOOL_KEYS: Record<string, Tool> = {
  v: "select", "1": "select",
  r: "rectangle", "2": "rectangle",
  d: "diamond", "3": "diamond",
  o: "ellipse", "4": "ellipse",
  a: "arrow", "5": "arrow",
  l: "line", "6": "line",
  p: "pencil", "7": "pencil",
  t: "text", "8": "text",
  e: "eraser", "0": "eraser",
  k: "laser",
  h: "hand",
};

export interface ShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
}

/** Campo onde a pessoa está digitando: nenhum atalho do quadro pode agir aí. */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  const attr = el.getAttribute?.("contenteditable");
  return attr === "" || attr === "true" || attr === "plaintext-only";
}

export function resolveShortcut(e: ShortcutEvent): ShortcutAction | null {
  if (isEditableTarget(e.target)) return null;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  if (e.ctrlKey || e.metaKey) {
    switch (key) {
      case "z":
        return e.shiftKey ? { kind: "redo" } : { kind: "undo" };
      case "y":
        return { kind: "redo" };
      case "d":
        return { kind: "duplicate" };
      case "a":
        return { kind: "selectAll" };
      case "c":
        return { kind: "copy" };
      case "v":
        return { kind: "paste" };
      case "x":
        return { kind: "cut" };
      case "g":
        return e.shiftKey ? { kind: "ungroup" } : { kind: "group" };
      case "l":
        return e.shiftKey ? { kind: "lock" } : null; // Ctrl+L é da barra de endereço do navegador
      case "]":
        return { kind: "front" };
      case "[":
        return { kind: "back" };
      default:
        return null;
    }
  }

  if (key === "Delete" || key === "Backspace") return { kind: "delete" };
  if (key === "Escape") return { kind: "escape" };
  if (key === "]") return { kind: "forward" };
  if (key === "[") return { kind: "backward" };
  if (key === "f") return { kind: "presentation" };
  const tool = TOOL_KEYS[key];
  return tool ? { kind: "tool", tool } : null;
}

/**
 * Os atalhos do CRM (N = tarefas, L = leads) devem ficar quietos? Sim quando o alvo está no quadro OU quando há um
 * quadro aberto (/quadro/:id): com o foco no corpo da página, ou num menu que o Radix leva para fora do quadro,
 * o alvo do evento não está dentro do elemento do quadro.
 */
export function isWhiteboardContext(target: EventTarget | null, pathname: string): boolean {
  return pathname.startsWith("/quadro/") || isInsideWhiteboard(target);
}

/** O alvo está dentro do editor do quadro? (o CRM usa isso para não disparar seus próprios atalhos lá) */
export function isInsideWhiteboard(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  return el.closest("[data-whiteboard-root]") !== null;
}
