import { describe, it, expect } from "vitest";
import { backupFileName, buildBackup, folderFileNames, parseBackup } from "./backup";
import { createElement, docFromElements, serializeScene } from "./scene";

const doc = () => docFromElements([createElement("rectangle", 0, 0, { width: 10, height: 10 })]);

describe("buildBackup / parseBackup", () => {
  it("ida e volta, passando por JSON de verdade", () => {
    const backup = buildBackup([{ title: "Funil", doc: doc() }, { title: "Aula 1", doc: doc() }], new Date("2026-11-14T12:00:00Z"));
    expect(backup).toMatchObject({ format: "vault-quadros-backup", version: 1, exportedAt: "2026-11-14T12:00:00.000Z" });
    const parsed = parseBackup(JSON.parse(JSON.stringify(backup)));
    expect(parsed.ok && parsed.boards.map((b) => b.title)).toEqual(["Funil", "Aula 1"]);
    expect(parsed.ok && parsed.boards[0].doc.pages).toHaveLength(1);
  });

  it("aceita quadro no formato antigo (lista de elementos) e converte", () => {
    const raw = {
      format: "vault-quadros-backup",
      version: 1,
      exportedAt: "x",
      boards: [{ title: "Velho", scene: serializeScene([createElement("rectangle", 0, 0, { width: 5, height: 5 })]) }],
    };
    const parsed = parseBackup(raw);
    expect(parsed.ok && parsed.boards[0].doc.pages[0].elements).toHaveLength(1);
  });

  it("título que não é texto vira 'Sem título'", () => {
    const raw = { ...buildBackup([{ title: "x", doc: doc() }]), boards: [{ title: 5, doc: doc() }] };
    const parsed = parseBackup(JSON.parse(JSON.stringify(raw)));
    expect(parsed.ok && parsed.boards[0].title).toBe("Sem título");
  });

  it("recusa o que não é um backup, com mensagem em português", () => {
    for (const bad of ["x", null, 5, [], {}, { format: "outro" }, { format: "vault-quadros-backup", version: 2, boards: [] }, { format: "vault-quadros-backup", version: 1, boards: "x" }]) {
      const r = parseBackup(bad);
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.error.length).toBeGreaterThan(5);
    }
  });

  it("backup sem nenhum quadro é recusado", () => {
    expect(parseBackup({ format: "vault-quadros-backup", version: 1, boards: [] }).ok).toBe(false);
  });

  it("um quadro estragado barra a importação inteira e diz qual é (nada é importado pela metade)", () => {
    const good = buildBackup([{ title: "Bom", doc: doc() }]);
    const raw = JSON.parse(JSON.stringify({ ...good, boards: [...good.boards, { title: "Estragado", doc: { version: 2, pages: [] } }] }));
    const r = parseBackup(raw);
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("Estragado") });
  });
});

describe("nomes de arquivo", () => {
  it("o backup leva a data de hoje", () => {
    expect(backupFileName(new Date("2026-11-14T23:30:00"))).toBe("quadros-2026-11-14.json");
  });

  it("um arquivo por quadro, sem caracteres proibidos e sem nomes repetidos", () => {
    expect(folderFileNames(["Funil", 'Aula: "1"', "Funil", "  ", "Funil"])).toEqual([
      "Funil.quadro.json",
      "Aula 1.quadro.json",
      "Funil (2).quadro.json",
      "quadro.quadro.json",
      "Funil (3).quadro.json",
    ]);
  });

  it("não repete nem comparando maiúsculas e minúsculas (o Windows trata como o mesmo arquivo)", () => {
    expect(folderFileNames(["Funil", "funil"])).toEqual(["Funil.quadro.json", "funil (2).quadro.json"]);
  });
});
