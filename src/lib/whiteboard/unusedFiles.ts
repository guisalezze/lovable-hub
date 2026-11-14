import type { SceneDoc } from "./types";

/** Arquivos enviados há menos que isto não são considerados "sem uso": o quadro pode ainda não ter sido salvo. */
export const GRACE_MS = 60 * 60 * 1000;

export function collectFileIds(docs: SceneDoc[]): Set<string> {
  const ids = new Set<string>();
  for (const doc of docs) {
    for (const page of doc.pages) {
      for (const el of page.elements) {
        if ((el.type === "image" || el.type === "media") && el.fileId) ids.add(el.fileId);
      }
    }
  }
  return ids;
}

export function findUnused(files: { name: string; createdAt: string | null }[], used: Set<string>, now: number): string[] {
  return files
    .filter((f) => {
      if (used.has(f.name)) return false;
      if (!f.createdAt) return false;
      const t = Date.parse(f.createdAt);
      return Number.isFinite(t) && now - t >= GRACE_MS;
    })
    .map((f) => f.name);
}
