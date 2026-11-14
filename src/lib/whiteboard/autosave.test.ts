import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAutosaver, type SaveStatus } from "./autosave";
import type { SaveResult } from "./api";

const ok: SaveResult = { ok: true, updatedAt: "2026-01-01T00:00:00Z" };

function make(result: SaveResult | (() => Promise<SaveResult>) = ok, delay = 1500) {
  const save = vi.fn(typeof result === "function" ? result : async () => result);
  const statuses: SaveStatus[] = [];
  const saver = createAutosaver<number>({ save, delay, onStatus: (s) => statuses.push(s) });
  return { save, statuses, saver };
}

describe("createAutosaver", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("junta várias mudanças numa gravação só, com o valor mais recente", async () => {
    const { save, statuses, saver } = make();
    saver.schedule(1);
    await vi.advanceTimersByTimeAsync(500);
    saver.schedule(2);
    await vi.advanceTimersByTimeAsync(500);
    saver.schedule(3);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(3);
    expect(statuses).toEqual(["saving", "saved"]);
  });

  it("flush grava na hora e espera terminar", async () => {
    const { save, statuses, saver } = make();
    saver.schedule(7);
    await saver.flush();
    expect(save).toHaveBeenCalledWith(7);
    expect(statuses).toEqual(["saving", "saved"]);
  });

  it("flush sem nada pendente não grava", async () => {
    const { save, saver } = make();
    await saver.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it("erro vira status error e NÃO tenta de novo sozinho", async () => {
    const { save, statuses, saver } = make({ ok: false, reason: "error" });
    saver.schedule(1);
    await vi.advanceTimersByTimeAsync(1500);
    expect(statuses).toEqual(["saving", "error"]);
    await vi.advanceTimersByTimeAsync(1500 * 10);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("negado pelo servidor também vira error, sem laço de tentativas", async () => {
    const { save, statuses, saver } = make({ ok: false, reason: "denied" });
    saver.schedule(1);
    await vi.advanceTimersByTimeAsync(1500 * 10);
    expect(statuses.at(-1)).toBe("error");
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("conflito vira status conflict", async () => {
    const { statuses, saver } = make({ ok: false, reason: "conflict" });
    saver.schedule(1);
    await vi.advanceTimersByTimeAsync(1500);
    expect(statuses.at(-1)).toBe("conflict");
  });

  it("save que lança exceção vira error", async () => {
    const { statuses, saver } = make(async () => {
      throw new Error("rede caiu");
    });
    saver.schedule(1);
    await vi.advanceTimersByTimeAsync(1500);
    expect(statuses.at(-1)).toBe("error");
  });

  it("nova mudança depois do erro tenta de novo", async () => {
    const { save, saver } = make({ ok: false, reason: "error" });
    saver.schedule(1);
    await vi.advanceTimersByTimeAsync(1500);
    saver.schedule(2);
    await vi.advanceTimersByTimeAsync(1500);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(2);
  });

  it("flush depois de um erro tenta gravar o valor que falhou", async () => {
    const { save, saver } = make({ ok: false, reason: "error" });
    saver.schedule(5);
    await vi.advanceTimersByTimeAsync(1500);
    await saver.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(5);
  });

  it("dispose cancela o que estava pendente", async () => {
    const { save, saver } = make();
    saver.schedule(1);
    saver.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).not.toHaveBeenCalled();
  });

  it("mudança durante uma gravação em andamento é gravada depois, em ordem", async () => {
    let release: (r: SaveResult) => void = () => {};
    const first = new Promise<SaveResult>((res) => (release = res));
    const save = vi.fn().mockReturnValueOnce(first).mockResolvedValue(ok);
    const saver = createAutosaver<number>({ save, delay: 1000, onStatus: () => {} });
    saver.schedule(1);
    await vi.advanceTimersByTimeAsync(1000); // começa a gravar o 1
    saver.schedule(2);
    await vi.advanceTimersByTimeAsync(1000); // o 2 espera o 1 terminar
    expect(save).toHaveBeenCalledTimes(1);
    release(ok);
    await vi.advanceTimersByTimeAsync(10);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(2);
  });
});
