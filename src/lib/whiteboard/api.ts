import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { parseDoc, serializeDoc } from "./scene";
import type { SceneDoc } from "./types";
import type { BackupBoard } from "./backup";

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
async function guardedUpdate(id: string, patch: { scene: Json; thumbnail?: string | null } | { title: string }, expectedUpdatedAt: string): Promise<SaveResult> {
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

/** `thumbnail`: undefined = não mexe; null = limpa; texto = nova miniatura (grava junto, no mesmo update). */
export function saveScene(id: string, doc: SceneDoc, expectedUpdatedAt: string, thumbnail?: string | null): Promise<SaveResult> {
  return guardedUpdate(
    id,
    { scene: serializeDoc(doc) as unknown as Json, ...(thumbnail !== undefined ? { thumbnail } : {}) },
    expectedUpdatedAt,
  );
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

/** `baseUpdatedAt` = updated_at do servidor de que este rascunho parte (decide, ao reabrir, se há conflito). */
export function saveDraft(id: string, doc: SceneDoc, baseUpdatedAt: string): void {
  try {
    localStorage.setItem(draftKey(id), JSON.stringify({ ...serializeDoc(doc), savedAt: Date.now(), baseUpdatedAt }));
  } catch {
    /* armazenamento cheio ou bloqueado: segue sem rascunho */
  }
}

export function loadDraft(id: string): { doc: SceneDoc; savedAt: number; baseUpdatedAt: string | null } | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const result = parseDoc(parsed);
    if (!("doc" in result)) return null;
    return {
      doc: result.doc,
      savedAt: Number(parsed.savedAt) || 0,
      baseUpdatedAt: typeof parsed.baseUpdatedAt === "string" ? parsed.baseUpdatedAt : null,
    };
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

// ---- backup: ler todos os quadros e inserir quadros importados ----

type FetchAllResult = { ok: true; boards: { id: string; title: string; doc: SceneDoc }[]; skipped: string[] } | { ok: false };

/** Todos os quadros, já lidos. Quadro com formato ilegível não entra: vai para `skipped`, para o backup não fingir que o guardou. */
export async function fetchAllBoards(): Promise<FetchAllResult> {
  try {
    const { data, error } = await supabase.from("whiteboards").select("id,title,scene").order("created_at", { ascending: true });
    if (error || !data) return { ok: false };
    const boards: { id: string; title: string; doc: SceneDoc }[] = [];
    const skipped: string[] = [];
    for (const row of data) {
      const parsed = parseDoc(row.scene);
      if ("doc" in parsed) boards.push({ id: row.id, title: row.title, doc: parsed.doc });
      else skipped.push(row.title);
    }
    return { ok: true, boards, skipped };
  } catch {
    return { ok: false };
  }
}

/** Cria os quadros importados (todos numa chamada: ou entram todos ou nenhum). */
export async function insertBoards(boards: BackupBoard[], userId: string | null): Promise<{ ok: true; count: number } | { ok: false }> {
  try {
    const rows = boards.map((b) => ({ title: b.title, scene: serializeDoc(b.doc) as unknown as Json, created_by: userId }));
    const { error } = await supabase.from("whiteboards").insert(rows);
    return error ? { ok: false } : { ok: true, count: rows.length };
  } catch {
    return { ok: false };
  }
}
