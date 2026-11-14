import { backupFileName, buildBackup, folderFileNames, parseBackup, type BackupBoard } from "./backup";
import { downloadBlob } from "./export";

export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

type ReadResult = ReturnType<typeof parseBackup>;

/** Lê o arquivo de backup escolhido: nunca estoura erro, sempre devolve uma mensagem que dá para mostrar. */
export async function readBackupFile(file: { size: number; text: () => Promise<string> }): Promise<ReadResult> {
  if (file.size > MAX_BACKUP_BYTES) return { ok: false, error: "O arquivo é grande demais para um backup de quadros." };
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: "Não consegui ler o arquivo." };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "O arquivo não é um JSON válido." };
  }
  return parseBackup(raw);
}

/** Baixa um arquivo único com todos os quadros. */
export function downloadBackup(boards: BackupBoard[]): void {
  const blob = new Blob([JSON.stringify(buildBackup(boards), null, 1)], { type: "application/json" });
  downloadBlob(blob, backupFileName());
}

interface FileHandleLike {
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}
export interface DirectoryHandleLike {
  getFileHandle(name: string, options: { create: boolean }): Promise<FileHandleLike>;
}

type FolderResult = { ok: true; count: number } | { ok: false; reason: "unsupported" | "cancelled" | "error"; saved?: number };

/**
 * Salva um arquivo por quadro numa pasta que a pessoa escolhe (API de arquivos do navegador).
 * Cada arquivo é um backup de um quadro só, então dá para importar de volta. Arquivos de mesmo nome são substituídos.
 */
export async function saveBackupToFolder(boards: BackupBoard[], pick?: () => Promise<DirectoryHandleLike>): Promise<FolderResult> {
  if (boards.length === 0) return { ok: true, count: 0 };
  if (!pick) return { ok: false, reason: "unsupported" };

  let dir: DirectoryHandleLike;
  try {
    dir = await pick();
  } catch (e) {
    return { ok: false, reason: (e as { name?: string })?.name === "AbortError" ? "cancelled" : "error" };
  }

  const names = folderFileNames(boards.map((b) => b.title));
  let saved = 0;
  for (let i = 0; i < boards.length; i++) {
    try {
      const handle = await dir.getFileHandle(names[i], { create: true });
      const writable = await handle.createWritable();
      await writable.write(JSON.stringify(buildBackup([boards[i]]), null, 1));
      await writable.close();
      saved++;
    } catch {
      return { ok: false, reason: "error", saved };
    }
  }
  return { ok: true, count: saved };
}

/** O seletor de pasta do navegador, se existir (Chrome e Edge). */
export function folderPicker(): (() => Promise<DirectoryHandleLike>) | undefined {
  const w = window as unknown as { showDirectoryPicker?: (o?: { mode: string }) => Promise<DirectoryHandleLike> };
  return typeof w.showDirectoryPicker === "function" ? () => w.showDirectoryPicker!({ mode: "readwrite" }) : undefined;
}
