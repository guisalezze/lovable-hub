import type { WbElement } from "./types";

export type DraftDecision = "none" | "recover" | "conflict";

interface Draft {
  elements: WbElement[];
  savedAt: number;
  /** updated_at do servidor no momento em que o rascunho foi gravado (a versão em que ele se baseia). */
  baseUpdatedAt: string | null;
}

/**
 * O que fazer com o rascunho local ao abrir um quadro.
 * - none: não há rascunho, ou ele é igual ao que já está salvo;
 * - recover: o rascunho nasceu da versão que está no servidor agora, então é só continuar de onde parou;
 * - conflict: o servidor mudou depois (ou não sabemos em cima de quê o rascunho foi feito):
 *   a pessoa escolhe, nada é sobrescrito em silêncio.
 * Nunca compara relógios: a hora do computador não prova nada sobre qual versão é mais nova.
 */
export function decideDraft(draft: Draft | null, server: { updatedAt: string; elements: WbElement[] }): DraftDecision {
  if (!draft) return "none";
  if (JSON.stringify(draft.elements) === JSON.stringify(server.elements)) return "none";
  return draft.baseUpdatedAt !== null && draft.baseUpdatedAt === server.updatedAt ? "recover" : "conflict";
}
