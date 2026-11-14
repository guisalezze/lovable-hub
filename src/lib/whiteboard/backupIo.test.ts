import { describe, it, expect, vi } from "vitest";
import { MAX_BACKUP_BYTES, readBackupFile, saveBackupToFolder } from "./backupIo";
import { buildBackup, parseBackup } from "./backup";
import { createElement, docFromElements } from "./scene";
import { shouldRegenerateThumbnail, THUMB_INTERVAL_MS } from "./thumbnail";

const board = (title: string) => ({ title, doc: docFromElements([createElement("rectangle", 0, 0, { width: 10, height: 10 })]) });
const fileOf = (text: string, size = text.length) => ({ size, text: () => Promise.resolve(text) });

describe("readBackupFile", () => {
  it("lê um backup válido", async () => {
    const text = JSON.stringify(buildBackup([board("Funil")]));
    const r = await readBackupFile(fileOf(text));
    expect(r.ok && r.boards[0].title).toBe("Funil");
  });

  it("arquivo que não é JSON vira mensagem em português, sem estourar erro", async () => {
    const r = await readBackupFile(fileOf("isto não é json"));
    expect(r).toEqual({ ok: false, error: "O arquivo não é um JSON válido." });
  });

  it("JSON que não é um backup é recusado", async () => {
    const r = await readBackupFile(fileOf(JSON.stringify({ oi: 1 })));
    expect(r.ok).toBe(false);
  });

  it("arquivo enorme é recusado antes de ser lido", async () => {
    const text = vi.fn(() => Promise.resolve("{}"));
    const r = await readBackupFile({ size: MAX_BACKUP_BYTES + 1, text });
    expect(r.ok).toBe(false);
    expect(text).not.toHaveBeenCalled();
  });

  it("falha ao ler o arquivo também vira mensagem", async () => {
    const r = await readBackupFile({ size: 10, text: () => Promise.reject(new Error("disco")) });
    expect(r).toEqual({ ok: false, error: "Não consegui ler o arquivo." });
  });
});

function fakeDirectory(opts: { failOn?: string } = {}) {
  const written: Record<string, string> = {};
  const dir = {
    getFileHandle: vi.fn(async (name: string) => {
      if (opts.failOn === name) throw new Error("sem permissão");
      return {
        createWritable: async () => ({
          write: async (data: string) => {
            written[name] = data;
          },
          close: async () => undefined,
        }),
      };
    }),
  };
  return { dir, written };
}

describe("saveBackupToFolder", () => {
  it("grava um arquivo por quadro, cada um um backup que dá para importar", async () => {
    const { dir, written } = fakeDirectory();
    const r = await saveBackupToFolder([board("Funil"), board("Aula 1")], async () => dir);
    expect(r).toEqual({ ok: true, count: 2 });
    expect(Object.keys(written)).toEqual(["Funil.quadro.json", "Aula 1.quadro.json"]);
    const reread = parseBackup(JSON.parse(written["Funil.quadro.json"]));
    expect(reread.ok && reread.boards[0].title).toBe("Funil");
  });

  it("títulos iguais não se sobrescrevem", async () => {
    const { dir, written } = fakeDirectory();
    await saveBackupToFolder([board("Funil"), board("Funil")], async () => dir);
    expect(Object.keys(written)).toEqual(["Funil.quadro.json", "Funil (2).quadro.json"]);
  });

  it("sem suporte do navegador (sem seletor de pasta)", async () => {
    expect(await saveBackupToFolder([board("A")], undefined)).toEqual({ ok: false, reason: "unsupported" });
  });

  it("cancelar a escolha da pasta não é erro", async () => {
    const r = await saveBackupToFolder([board("A")], async () => {
      throw new DOMException("cancelado", "AbortError");
    });
    expect(r).toEqual({ ok: false, reason: "cancelled" });
  });

  it("falha ao gravar um arquivo vira erro (e diz quantos foram gravados antes)", async () => {
    const { dir } = fakeDirectory({ failOn: "B.quadro.json" });
    const r = await saveBackupToFolder([board("A"), board("B"), board("C")], async () => dir);
    expect(r).toEqual({ ok: false, reason: "error", saved: 1 });
  });

  it("sem quadros não escolhe pasta nem grava nada", async () => {
    const pick = vi.fn();
    expect(await saveBackupToFolder([], pick)).toEqual({ ok: true, count: 0 });
    expect(pick).not.toHaveBeenCalled();
  });
});

describe("shouldRegenerateThumbnail", () => {
  it("na primeira vez sempre gera", () => {
    expect(shouldRegenerateThumbnail(0, 5)).toBe(true);
  });

  it("dentro do intervalo não gera de novo (poupa o trabalho a cada autosave)", () => {
    expect(shouldRegenerateThumbnail(1000, 1000 + THUMB_INTERVAL_MS - 1)).toBe(false);
  });

  it("passado o intervalo gera", () => {
    expect(shouldRegenerateThumbnail(1000, 1000 + THUMB_INTERVAL_MS)).toBe(true);
  });

  it("force ignora o intervalo", () => {
    expect(shouldRegenerateThumbnail(1000, 1001, true)).toBe(true);
  });
});
