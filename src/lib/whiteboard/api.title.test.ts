import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));

import { supabase } from "@/integrations/supabase/client";
import { saveTitle, fetchUpdatedAt } from "./api";

function builder(result: unknown) {
  const b: Record<string, unknown> = {};
  for (const m of ["update", "select", "eq"]) b[m] = vi.fn(() => b);
  b.single = vi.fn(() => Promise.resolve(result));
  b.maybeSingle = vi.fn(() => Promise.resolve(result));
  b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej);
  return b;
}

const from = supabase.from as unknown as ReturnType<typeof vi.fn>;

describe("saveTitle", () => {
  beforeEach(() => from.mockReset());

  it("grava o título com a mesma checagem de updated_at e devolve o novo valor", async () => {
    const q = builder({ data: [{ updated_at: "T2" }], error: null });
    from.mockReturnValueOnce(q);
    expect(await saveTitle("id1", "  Funil de vendas  ", "T1")).toEqual({ ok: true, updatedAt: "T2" });
    expect(q.update).toHaveBeenCalledWith({ title: "Funil de vendas" });
    expect(q.eq).toHaveBeenCalledWith("updated_at", "T1");
  });

  it("título vazio vira 'Sem título'", async () => {
    const q = builder({ data: [{ updated_at: "T2" }], error: null });
    from.mockReturnValueOnce(q);
    await saveTitle("id1", "   ", "T1");
    expect(q.update).toHaveBeenCalledWith({ title: "Sem título" });
  });

  it("detecta conflito como o salvamento da cena", async () => {
    from.mockReturnValueOnce(builder({ data: [], error: null }));
    from.mockReturnValueOnce(builder({ data: { updated_at: "T9" }, error: null }));
    expect(await saveTitle("id1", "Novo", "T1")).toEqual({ ok: false, reason: "conflict" });
  });
});

describe("fetchUpdatedAt", () => {
  beforeEach(() => from.mockReset());

  it("devolve o updated_at atual", async () => {
    from.mockReturnValueOnce(builder({ data: { updated_at: "T7" }, error: null }));
    expect(await fetchUpdatedAt("id1")).toBe("T7");
  });

  it("devolve null em erro ou quadro inexistente", async () => {
    from.mockReturnValueOnce(builder({ data: null, error: { message: "x" } }));
    expect(await fetchUpdatedAt("id1")).toBeNull();
    from.mockReturnValueOnce(builder({ data: null, error: null }));
    expect(await fetchUpdatedAt("id1")).toBeNull();
  });
});
