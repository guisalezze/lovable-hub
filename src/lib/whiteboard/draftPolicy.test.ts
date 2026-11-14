import { describe, it, expect } from "vitest";
import { decideDraft } from "./draftPolicy";
import { createElement, docFromElements } from "./scene";
import { addPage } from "./pages";

const mine = docFromElements([createElement("rectangle", 0, 0, { width: 10, height: 10 })], "p1");
const theirs = docFromElements([createElement("ellipse", 50, 50, { width: 20, height: 20 })], "p1");
const server = (updatedAt: string, doc = theirs) => ({ updatedAt, doc });
const draft = (baseUpdatedAt: string | null, savedAt = 1000) => ({ doc: mine, savedAt, baseUpdatedAt });

describe("decideDraft", () => {
  it("sem rascunho não há o que recuperar", () => {
    expect(decideDraft(null, server("T1"))).toBe("none");
  });

  it("rascunho feito em cima da versão que está no servidor: recupera", () => {
    expect(decideDraft(draft("T1"), server("T1"))).toBe("recover");
  });

  it("o servidor mudou depois do rascunho: conflito (ninguém é sobrescrito em silêncio)", () => {
    expect(decideDraft(draft("T1"), server("T2"))).toBe("conflict");
  });

  it("nunca compara relógios: a hora do rascunho não decide nada", () => {
    const farFuture = Number.MAX_SAFE_INTEGER;
    expect(decideDraft(draft("T1", farFuture), server("T2"))).toBe("conflict");
    expect(decideDraft(draft("T1", 0), server("T1"))).toBe("recover");
  });

  it("rascunho sem versão de base (formato antigo): trata como conflito, nunca como recuperação automática", () => {
    expect(decideDraft(draft(null), server("T1"))).toBe("conflict");
  });

  it("rascunho idêntico ao que já está no servidor é ignorado, mesmo com versão diferente", () => {
    expect(decideDraft({ doc: theirs, savedAt: 5, baseUpdatedAt: "T0" }, server("T9", theirs))).toBe("none");
    expect(decideDraft({ doc: theirs, savedAt: 5, baseUpdatedAt: "T9" }, server("T9", theirs))).toBe("none");
  });

  it("uma página a mais já é uma diferença", () => {
    const withExtra = addPage(mine).doc;
    expect(decideDraft({ doc: withExtra, savedAt: 1, baseUpdatedAt: "T1" }, server("T1", mine))).toBe("recover");
  });
});
