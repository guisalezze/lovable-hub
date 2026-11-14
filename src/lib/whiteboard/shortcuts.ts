import type { Tool } from "./types";

export type ShortcutAction =
  | { kind: "tool"; tool: Tool }
  | { kind: "undo" }
  | { kind: "redo" }
  | { kind: "delete" }
  | { kind: "selectAll" }
  | { kind: "duplicate" }
  | { kind: "escape" };

const TOOL_KEYS: Record<string, Tool> = {
  v: "select", "1": "select",
  r: "rectangle", "2": "rectangle",
  d: "diamond", "3": "diamond",
  o: "ellipse", "4": "ellipse",
  a: "arrow", "5": "arrow",
  l: "line", "6": "line",
  p: "pencil", "7": "pencil",
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
      default:
        return null;
    }
  }

  if (key === "Delete" || key === "Backspace") return { kind: "delete" };
  if (key === "Escape") return { kind: "escape" };
  const tool = TOOL_KEYS[key];
  return tool ? { kind: "tool", tool } : null;
}
