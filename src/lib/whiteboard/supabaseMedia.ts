import { supabase } from "@/integrations/supabase/client";
import { newId } from "./scene";
import type { MediaStore } from "./mediaCache";
import { fetchAllBoards } from "./api";
import { collectFileIds, findUnused } from "./unusedFiles";

const BUCKET = "whiteboard-files";
const URL_TTL = 60 * 60; // segundos

function safeName(name: string): string {
  const clean = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return clean.slice(-80) || "arquivo";
}

/** Guarda os arquivos do quadro no armazenamento privado do Supabase. */
export function createSupabaseMediaStore(): MediaStore {
  const urlCache = new Map<string, { url: string; at: number }>();
  return {
    async upload(file) {
      const path = `${newId()}-${safeName(file.name)}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      return path;
    },
    async url(fileId) {
      const hit = urlCache.get(fileId);
      if (hit && Date.now() - hit.at < (URL_TTL - 300) * 1000) return hit.url;
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(fileId, URL_TTL);
      if (error || !data) throw error ?? new Error("sem endereço");
      urlCache.set(fileId, { url: data.signedUrl, at: Date.now() });
      return data.signedUrl;
    },
    async remove(fileIds) {
      if (fileIds.length === 0) return;
      const { error } = await supabase.storage.from(BUCKET).remove(fileIds);
      if (error) throw error;
    },
  };
}

type Scan = { ok: true; unused: string[]; total: number } | { ok: false; reason: "boards" | "unreadable" | "storage" };

/** Acha os arquivos que nenhum quadro usa. Se algum quadro não pôde ser lido, não arrisca: não apaga nada. */
export async function scanUnusedFiles(): Promise<Scan> {
  const boards = await fetchAllBoards();
  if (!("boards" in boards)) return { ok: false, reason: "boards" };
  if (boards.skipped.length > 0) return { ok: false, reason: "unreadable" };
  const used = collectFileIds(boards.boards.map((b) => b.doc));

  const files: { name: string; createdAt: string | null }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(BUCKET).list("", { limit: 1000, offset });
    if (error || !data) return { ok: false, reason: "storage" };
    for (const f of data) if (f.id) files.push({ name: f.name, createdAt: f.created_at ?? null });
    if (data.length < 1000) break;
  }
  return { ok: true, unused: findUnused(files, used, Date.now()), total: files.length };
}

export async function deleteFiles(names: string[]): Promise<boolean> {
  try {
    await createSupabaseMediaStore().remove(names);
    return true;
  } catch {
    return false;
  }
}
