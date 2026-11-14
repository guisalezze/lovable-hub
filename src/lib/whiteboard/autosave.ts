import type { SaveResult } from "./api";

export type SaveStatus = "saved" | "saving" | "error" | "conflict";

export interface Autosaver<T> {
  schedule(value: T): void;
  flush(): Promise<void>;
  dispose(): void;
}

/**
 * Grava com atraso, juntando várias mudanças numa só gravação (vale a mais recente).
 * Nunca tenta de novo sozinho depois de um erro: só numa nova mudança ou num flush().
 */
export function createAutosaver<T>(opts: {
  save: (value: T) => Promise<SaveResult>;
  delay: number;
  onStatus: (status: SaveStatus) => void;
}): Autosaver<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: { value: T } | null = null;
  let inflight: Promise<void> | null = null;
  let disposed = false;

  const run = async (): Promise<void> => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    while (inflight) await inflight;
    if (disposed || !pending) return;

    const { value } = pending;
    pending = null;
    opts.onStatus("saving");
    inflight = opts
      .save(value)
      .catch((): SaveResult => ({ ok: false, reason: "error" }))
      .then((result) => {
        if ("reason" in result) {
          // guarda o valor que falhou: um flush() (ao sair da página) ainda pode tentar uma vez
          if (!pending) pending = { value };
          opts.onStatus(result.reason === "conflict" ? "conflict" : "error");
        } else {
          opts.onStatus("saved");
        }
      });
    await inflight;
    inflight = null;
  };

  return {
    schedule(value) {
      if (disposed) return;
      pending = { value };
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void run(), opts.delay);
    },
    flush: run,
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
      pending = null;
    },
  };
}
