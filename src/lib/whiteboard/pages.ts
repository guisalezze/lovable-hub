import type { Page, SceneDoc, WbElement } from "./types";
import { newId } from "./scene";
import { cloneElements } from "./ops";

const MAX_NAME = 60;

export function activePage(doc: SceneDoc): Page | undefined {
  return doc.pages.find((p) => p.id === doc.activePageId) ?? doc.pages[0];
}

/** Acrescenta uma página vazia no fim, com o próximo nome livre ("Página 2", "Página 3"...), e a ativa. */
export function addPage(doc: SceneDoc): { doc: SceneDoc; id: string } {
  const names = new Set(doc.pages.map((p) => p.name));
  let n = doc.pages.length + 1;
  while (names.has(`Página ${n}`)) n++;
  const page: Page = { id: newId(), name: `Página ${n}`, elements: [] };
  return { doc: { ...doc, pages: [...doc.pages, page], activePageId: page.id }, id: page.id };
}

export function renamePage(doc: SceneDoc, id: string, name: string): SceneDoc {
  const clean = name.trim().slice(0, MAX_NAME);
  const page = doc.pages.find((p) => p.id === id);
  if (!page || clean === "" || clean === page.name) return doc;
  return { ...doc, pages: doc.pages.map((p) => (p.id === id ? { ...p, name: clean } : p)) };
}

/** Exclui a página (a última nunca é excluída). Se era a ativa, passa para a anterior (ou a próxima). */
export function deletePage(doc: SceneDoc, id: string): SceneDoc {
  const index = doc.pages.findIndex((p) => p.id === id);
  if (index < 0 || doc.pages.length <= 1) return doc;
  const pages = doc.pages.filter((p) => p.id !== id);
  const activePageId = doc.activePageId === id ? (pages[index - 1] ?? pages[index]).id : doc.activePageId;
  return { ...doc, pages, activePageId };
}

/** Copia a página (com elementos novos, ligações refeitas) logo depois dela e a ativa. */
export function duplicatePage(doc: SceneDoc, id: string): { doc: SceneDoc; id: string } {
  const index = doc.pages.findIndex((p) => p.id === id);
  if (index < 0) return { doc, id: "" };
  const source = doc.pages[index];
  const copy: Page = { id: newId(), name: `${source.name} (cópia)`.slice(0, MAX_NAME + 8), elements: cloneElements(source.elements, 0) };
  const pages = [...doc.pages.slice(0, index + 1), copy, ...doc.pages.slice(index + 1)];
  return { doc: { ...doc, pages, activePageId: copy.id }, id: copy.id };
}

export function movePage(doc: SceneDoc, id: string, toIndex: number): SceneDoc {
  const from = doc.pages.findIndex((p) => p.id === id);
  if (from < 0) return doc;
  const to = Math.min(Math.max(toIndex, 0), doc.pages.length - 1);
  if (to === from) return doc;
  const pages = [...doc.pages];
  const [moved] = pages.splice(from, 1);
  pages.splice(to, 0, moved);
  return { ...doc, pages };
}

export function setActivePage(doc: SceneDoc, id: string): SceneDoc {
  if (id === doc.activePageId || !doc.pages.some((p) => p.id === id)) return doc;
  return { ...doc, activePageId: id };
}

/** Troca os elementos da página ativa (as outras páginas ficam as mesmas). */
export function updateActiveElements(doc: SceneDoc, elements: WbElement[]): SceneDoc {
  return { ...doc, pages: doc.pages.map((p) => (p.id === doc.activePageId ? { ...p, elements } : p)) };
}
