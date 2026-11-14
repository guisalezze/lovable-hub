import type { WbElement } from "./types";
import { newId, newSeed } from "./scene";
import { getBounds, getSelectionBounds } from "./geometry";

export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";

/**
 * Área de transferência do quadro. Fica no módulo (e não no motor) para valer também
 * quando a pessoa troca de quadro: copia num, abre outro e cola.
 */
export const clipboard: { items: WbElement[]; pasteCount: number } = { items: [], pasteCount: 0 };

/** Cópias com id e seed novos, deslocadas em `offset`; cada grupo copiado ganha um groupId novo. */
export function cloneElements(source: WbElement[], offset: number): WbElement[] {
  const groups = new Map<string, string>();
  return source.map((el) => {
    let groupId = el.groupId;
    if (groupId) {
      if (!groups.has(groupId)) groups.set(groupId, newId());
      groupId = groups.get(groupId)!;
    }
    return {
      ...el,
      id: newId(),
      seed: newSeed(),
      x: el.x + offset,
      y: el.y + offset,
      groupId,
      ...(el.points ? { points: el.points.map((p) => [...p] as [number, number]) } : {}),
    };
  });
}

export function duplicateElements(all: WbElement[], ids: Set<string>, offset = 20): { elements: WbElement[]; newIds: string[] } {
  const copies = cloneElements(all.filter((el) => ids.has(el.id)), offset);
  return { elements: [...all, ...copies], newIds: copies.map((c) => c.id) };
}

/** Acrescenta à seleção todos os membros dos grupos já selecionados. */
export function expandToGroups(all: WbElement[], ids: Set<string>): Set<string> {
  const groups = new Set(all.filter((el) => ids.has(el.id) && el.groupId).map((el) => el.groupId));
  const out = new Set(ids);
  if (groups.size === 0) return out;
  for (const el of all) if (el.groupId && groups.has(el.groupId)) out.add(el.id);
  return out;
}

export function groupElements(all: WbElement[], ids: Set<string>): WbElement[] {
  const members = expandToGroups(all, ids);
  const groupId = newId();
  return all.map((el) => (members.has(el.id) ? { ...el, groupId } : el));
}

export function ungroupElements(all: WbElement[], ids: Set<string>): WbElement[] {
  const members = expandToGroups(all, ids);
  return all.map((el) => (members.has(el.id) && el.groupId ? { ...el, groupId: null } : el));
}

export function bringToFront(all: WbElement[], ids: Set<string>): WbElement[] {
  return [...all.filter((el) => !ids.has(el.id)), ...all.filter((el) => ids.has(el.id))];
}

export function sendToBack(all: WbElement[], ids: Set<string>): WbElement[] {
  return [...all.filter((el) => ids.has(el.id)), ...all.filter((el) => !ids.has(el.id))];
}

export function bringForward(all: WbElement[], ids: Set<string>): WbElement[] {
  const out = [...all];
  for (let i = out.length - 2; i >= 0; i--) {
    if (ids.has(out[i].id) && !ids.has(out[i + 1].id)) [out[i], out[i + 1]] = [out[i + 1], out[i]];
  }
  return out;
}

export function sendBackward(all: WbElement[], ids: Set<string>): WbElement[] {
  const out = [...all];
  for (let i = 1; i < out.length; i++) {
    if (ids.has(out[i].id) && !ids.has(out[i - 1].id)) [out[i], out[i - 1]] = [out[i - 1], out[i]];
  }
  return out;
}

/** Seleção mista trava tudo; se tudo já estava travado, destrava tudo. */
export function toggleLock(all: WbElement[], ids: Set<string>): WbElement[] {
  const selected = all.filter((el) => ids.has(el.id));
  const allLocked = selected.length > 0 && selected.every((el) => el.locked);
  return all.map((el) => (ids.has(el.id) ? { ...el, locked: !allLocked } : el));
}

/** Alinha os selecionados (menos os bloqueados) pela caixa do conjunto. Menos de dois itens: nada muda. */
export function alignElements(all: WbElement[], ids: Set<string>, mode: AlignMode): WbElement[] {
  const targets = all.filter((el) => ids.has(el.id) && !el.locked);
  if (targets.length < 2) return all;
  const u = getSelectionBounds(targets)!;
  const moveIds = new Set(targets.map((el) => el.id));

  return all.map((el) => {
    if (!moveIds.has(el.id)) return el;
    const b = getBounds(el);
    let dx = 0;
    let dy = 0;
    if (mode === "left") dx = u.x - b.x;
    else if (mode === "right") dx = u.x + u.width - (b.x + b.width);
    else if (mode === "center") dx = u.x + u.width / 2 - (b.x + b.width / 2);
    else if (mode === "top") dy = u.y - b.y;
    else if (mode === "bottom") dy = u.y + u.height - (b.y + b.height);
    else dy = u.y + u.height / 2 - (b.y + b.height / 2);
    return dx === 0 && dy === 0 ? el : { ...el, x: el.x + dx, y: el.y + dy };
  });
}
