import { describe, it, expect } from "vitest";
import { collectFileIds, findUnused } from "./unusedFiles";
import { createElement, docFromElements } from "./scene";

const img = (fileId: string) => createElement("image", 0, 0, { fileId, mime: "image/png" });

describe("collectFileIds", () => {
  it("junta os arquivos de todas as páginas de todos os quadros, sem repetir", () => {
    const a = docFromElements([img("a.png"), createElement("rectangle", 0, 0)]);
    const b = { ...docFromElements([img("b.mp3"), img("a.png")]) };
    b.pages = [...b.pages, { id: "p2", name: "2", elements: [createElement("media", 0, 0, { fileId: "c.mp4", mime: "video/mp4" })] }];
    expect([...collectFileIds([a, b])].sort()).toEqual(["a.png", "b.mp3", "c.mp4"]);
  });
});

describe("findUnused", () => {
  const now = Date.parse("2026-11-14T12:00:00Z");
  const old = "2026-11-14T08:00:00Z";
  const fresh = "2026-11-14T11:50:00Z";

  it("devolve os arquivos que nenhum quadro usa", () => {
    const files = [
      { name: "a.png", createdAt: old },
      { name: "z.png", createdAt: old },
    ];
    expect(findUnused(files, new Set(["a.png"]), now)).toEqual(["z.png"]);
  });

  it("não mexe em arquivo recém-enviado (pode ainda não ter sido salvo no quadro)", () => {
    expect(findUnused([{ name: "novo.png", createdAt: fresh }], new Set(), now)).toEqual([]);
  });

  it("arquivo sem data conhecida é preservado", () => {
    expect(findUnused([{ name: "x.png", createdAt: null }], new Set(), now)).toEqual([]);
  });
});
