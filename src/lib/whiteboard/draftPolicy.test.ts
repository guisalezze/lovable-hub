import { describe, it, expect } from "vitest";
import { decideDraft } from "./draftPolicy";
import { createElement } from "./scene";

const mine = [createElement("rectangle", 0, 0, { width: 10, height: 10 })];
const theirs = [createElement("ellipse", 50, 50, { width: 20, height: 20 })];
const server = (updatedAt: string, elements = theirs) => ({ updatedAt, elements });
const draft = (baseUpdatedAt: string | null, savedAt = 1000) => ({ elements: mine, savedAt, baseUpdatedAt });

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
    expect(decideDraft({ elements: theirs, savedAt: 5, baseUpdatedAt: "T0" }, server("T9", theirs))).toBe("none");
    expect(decideDraft({ elements: theirs, savedAt: 5, baseUpdatedAt: "T9" }, server("T9", theirs))).toBe("none");
  });
});
