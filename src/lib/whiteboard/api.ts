import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { parseScene, serializeScene } from "./scene";
import type { WbElement } from "./types";

export type SaveResult =
  | { ok: true; updatedAt: string }
  | { ok: false; reason: "conflict" | "denied" | "error" };

export interface WhiteboardRow {
  id: string;
  title: string;
  scene: unknown;
  thumbnail: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Atualiza a linha só se ninguém mexeu desde `expectedUpdatedAt`.
 * Zero linhas afetadas tem duas causas e o Supabase não diferencia (a RLS só filtra):
 * por isso relê a linha — `updated_at` diferente = conflito; igual = sem permissão.
 */
async function guardedUpdate(id: string, patch: { scene: Json } | { title: string }, expectedUpdatedAt: string): Promise<SaveResult> {
  try {
    const { data, error } = await supabase
      .from("whiteboards")
      .update(patch)
      .eq("id", id)
      .eq("updated_at", expectedUpdatedAt)
      .select("updated_at");
    if (error) return { ok: false, reason: "error" };
    if (data && data.length > 0) return { ok: true, updatedAt: data[0].updated_at };

    const { data: row, error: readError } = await supabase
      .from("whiteboards")
      .select("updated_at")
      .eq("id", id)
      .maybeSingle();
    if (readError || !row) return { ok: false, reason: "error" };
    return { ok: false, reason: row.updated_at !== expectedUpdatedAt ? "conflict" : "denied" };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export function saveScene(id: string, elements: WbElement[], expectedUpdatedAt: string): Promise<SaveResult> {
  return guardedUpdate(id, { scene: serializeScene(elements) as unknown as Json }, expectedUpdatedAt);
}

export function saveTitle(id: string, title: string, expectedUpdatedAt: string): Promise<SaveResult> {
  return guardedUpdate(id, { title: title.trim() || "Sem título" }, expectedUpdatedAt);
}

/** updated_at atual do quadro (usado para "manter minha versão" depois de um conflito). */
export async function fetchUpdatedAt(id: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.from("whiteboards").select("updated_at").eq("id", id).maybeSingle();
    if (error || !data) return null;
    return data.updated_at;
  } catch {
    return null;
  }
}

// ---- rascunho local (rede caiu, aba fechou): nunca pode quebrar a página ----

const draftKey = (id: string) => `quadro-draft:${id}`;

export function saveDraft(id: string, elements: WbElement[]): void {
  try {
    localStorage.setItem(draftKey(id), JSON.stringify({ ...serializeScene(elements), savedAt: Date.now() }));
  } catch {
    /* armazenamento cheio ou bloqueado: segue sem rascunho */
  }
}

export function loadDraft(id: string): { elements: WbElement[]; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const scene = parseScene(parsed);
    if (!("elements" in scene)) return null;
    return { elements: scene.elements, savedAt: Number(parsed.savedAt) || 0 };
  } catch {
    return null;
  }
}

export function clearDraft(id: string): void {
  try {
    localStorage.removeItem(draftKey(id));
  } catch {
    /* ignora */
  }
}
