import type { SceneDoc } from "./types";
import { parseDoc, serializeDoc } from "./scene";

export const BACKUP_FORMAT = "vault-quadros-backup";

export interface BackupBoard {
  title: string;
  doc: SceneDoc;
}

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  boards: { title: string; doc: SceneDoc }[];
}

/** Arquivo de backup com todos os quadros (as páginas e os elementos; arquivos de mídia ficam no armazenamento). */
export function buildBackup(boards: BackupBoard[], now: Date = new Date()): Backup {
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: now.toISOString(),
    boards: boards.map((b) => ({ title: b.title, doc: serializeDoc(b.doc) })),
  };
}

type ParsedBackup = { ok: true; boards: BackupBoard[] } | { ok: false; error: string };

/** Lê um backup. Qualquer quadro estragado recusa o arquivo todo: nada é importado pela metade. */
export function parseBackup(raw: unknown): ParsedBackup {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Este arquivo não é um backup de quadros." };
  const b = raw as Record<string, unknown>;
  if (b.format !== BACKUP_FORMAT) return { ok: false, error: "Este arquivo não é um backup de quadros." };
  if (b.version !== 1) return { ok: false, error: `Este backup usa uma versão desconhecida (versão ${String(b.version)}).` };
  if (!Array.isArray(b.boards)) return { ok: false, error: "O backup está sem a lista de quadros." };
  if (b.boards.length === 0) return { ok: false, error: "O backup não tem nenhum quadro." };

  const boards: BackupBoard[] = [];
  for (const item of b.boards) {
    const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const title = typeof o.title === "string" && o.title.trim() ? o.title.trim() : "Sem título";
    const parsed = parseDoc(o.doc ?? o.scene);
    if ("error" in parsed) return { ok: false, error: `Quadro "${title}": ${parsed.error}` };
    boards.push({ title, doc: parsed.doc });
  }
  return { ok: true, boards };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function backupFileName(date: Date = new Date()): string {
  return `quadros-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

/** Um nome de arquivo por quadro (para salvar numa pasta): sem caracteres proibidos e sem repetir, nem trocando maiúsculas. */
export function folderFileNames(titles: string[]): string[] {
  const used = new Map<string, number>();
  return titles.map((title) => {
    const base = title.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim() || "quadro";
    const key = base.toLowerCase();
    const count = (used.get(key) ?? 0) + 1;
    used.set(key, count);
    return `${count === 1 ? base : `${base} (${count})`}.quadro.json`;
  });
}
