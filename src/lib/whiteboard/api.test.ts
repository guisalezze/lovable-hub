import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));

import { supabase } from "@/integrations/supabase/client";
import { saveScene, loadDraft, saveDraft, clearDraft } from "./api";
import { createElement } from "./scene";

/** Monta um "query builder" do Supabase que aceita encadear e resolve com `result`. */
function builder(result: unknown) {
  const b: Record<string, unknown> = {};
  for (const m of ["update", "select", "eq"]) b[m] = vi.fn(() => b);
  b.maybeSingle = vi.fn(() => Promise.resolve(result));
  b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej);
  return b;
}

const from = supabase.from as unknown as ReturnType<typeof vi.fn>;
const els = [createElement("rectangle", 1, 2, { width: 10, height: 10 })];

describe("saveScene", () => {
  beforeEach(() => from.mockReset());

  it("update que afeta uma linha devolve ok com o novo updated_at", async () => {
    const q = builder({ data: [{ updated_at: "T2" }], error: null });
    from.mockReturnValueOnce(q);
    const r = await saveScene("id1", els, "T1");
    expect(r).toEqual({ ok: true, updatedAt: "T2" });
    expect(q.eq).toHaveBeenCalledWith("id", "id1");
    expect(q.eq).toHaveBeenCalledWith("updated_at", "T1");
  });

  it("zero linhas e updated_at mudou na releitura: conflito", async () => {
    from.mockReturnValueOnce(builder({ data: [], error: null }));
    from.mockReturnValueOnce(builder({ data: { updated_at: "T9" }, error: null }));
    expect(await saveScene("id1", els, "T1")).toEqual({ ok: false, reason: "conflict" });
  });

  it("zero linhas e updated_at igual na releitura: permissão negada", async () => {
    from.mockReturnValueOnce(builder({ data: [], error: null }));
    from.mockReturnValueOnce(builder({ data: { updated_at: "T1" }, error: null }));
    expect(await saveScene("id1", els, "T1")).toEqual({ ok: false, reason: "denied" });
  });

  it("erro do cliente vira error", async () => {
    from.mockReturnValueOnce(builder({ data: null, error: { message: "boom" } }));
    expect(await saveScene("id1", els, "T1")).toEqual({ ok: false, reason: "error" });
  });

  it("exceção de rede vira error", async () => {
    from.mockImplementationOnce(() => {
      throw new Error("offline");
    });
    expect(await saveScene("id1", els, "T1")).toEqual({ ok: false, reason: "error" });
  });

  it("quadro apagado por outra pessoa (releitura vazia) vira error", async () => {
    from.mockReturnValueOnce(builder({ data: [], error: null }));
    from.mockReturnValueOnce(builder({ data: null, error: null }));
    expect(await saveScene("id1", els, "T1")).toEqual({ ok: false, reason: "error" });
  });
});

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  } as Storage;
}

describe("rascunho local", () => {
  // O localStorage global do Node 26 colide com o do jsdom: usamos um armazenamento em memória.
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("faz ida e volta", () => {
    saveDraft("q1", els, "T1");
    const d = loadDraft("q1");
    expect(d?.elements).toEqual(els);
    expect(typeof d?.savedAt).toBe("number");
    expect(d?.baseUpdatedAt).toBe("T1"); // versão do servidor em que o rascunho se baseia
  });

  it("clearDraft apaga", () => {
    saveDraft("q1", els, "T1");
    clearDraft("q1");
    expect(loadDraft("q1")).toBeNull();
  });

  it("JSON inválido ou formato errado devolve null", () => {
    localStorage.setItem("quadro-draft:q1", "{não é json");
    expect(loadDraft("q1")).toBeNull();
    localStorage.setItem("quadro-draft:q2", JSON.stringify({ version: 9, elements: [] }));
    expect(loadDraft("q2")).toBeNull();
  });

  it("localStorage lançando erro não quebra nada", () => {
    const boom = () => {
      throw new Error("bloqueado");
    };
    vi.stubGlobal("localStorage", { getItem: boom, setItem: boom, removeItem: boom });
    expect(loadDraft("q1")).toBeNull();
    expect(() => saveDraft("q1", els, "T1")).not.toThrow();
    expect(() => clearDraft("q1")).not.toThrow();
  });

  it("sem localStorage nenhum (undefined) também não quebra", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(loadDraft("q1")).toBeNull();
    expect(() => saveDraft("q1", els, "T1")).not.toThrow();
  });
});
