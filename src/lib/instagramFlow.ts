// Formato e helpers do fluxo de automação do Instagram (spec §3, §9, §10.2).
// Módulo puro (sem React/Supabase): usado pela lista e pelo construtor visual.

export type NodeType = "start" | "message" | "delay" | "tag" | "condition" | "webhook";
export type Trigger = "comment" | "dm" | "story" | "mention";
export type MatchType = "contains" | "exact";

export interface FlowButton {
  label: string;
  type: "flow" | "url";
  url?: string;
  next?: string | null;
}

export interface FlowNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  next?: string | null;
  yes?: string | null;
  no?: string | null;
  // message
  text?: string;
  image?: string;
  buttons?: FlowButton[];
  // delay
  amount?: number;
  unit?: "min" | "h" | "d";
  // tag / condition
  action?: "add" | "remove";
  tag?: string;
  // webhook
  url?: string;
}

export interface Flow {
  nodes: Record<string, FlowNode>;
}

/** Linha de public.ig_automations (a "regra" do spec). */
export interface IgRule {
  id: string;
  name: string;
  active: boolean | null;
  trigger: Trigger | string;
  keywords: string[];
  match_type: MatchType | string | null;
  post_id: string | null;
  media_label: string | null;
  public_replies: string[] | null;
  flow: Flow | null;
  position: number;
  created_at: string | null;
}

export const TRIGGER_LABEL: Record<string, string> = {
  comment: "Comentário",
  dm: "Direct",
  story: "Resposta a story",
  mention: "Menção no story",
};

export const IGN: Record<NodeType, { ico: string; cor: string; label: string }> = {
  start: { ico: "⚡", cor: "#16a34a", label: "Gatilho" },
  message: { ico: "💬", cor: "#2563eb", label: "Mensagem" },
  delay: { ico: "⏱", cor: "#d97706", label: "Esperar" },
  tag: { ico: "🏷", cor: "#7c3aed", label: "Tag" },
  condition: { ico: "⑂", cor: "#0d9488", label: "Condição" },
  webhook: { ico: "🔗", cor: "#475569", label: "Webhook" },
};

/** Campos padrão de cada tipo de bloco novo (sem id/x/y). */
export const IG_NEW: Record<Exclude<NodeType, "start">, () => Partial<FlowNode>> = {
  message: () => ({ text: "", buttons: [] }),
  delay: () => ({ amount: 1, unit: "h" }),
  tag: () => ({ action: "add", tag: "" }),
  condition: () => ({ tag: "" }),
  webhook: () => ({ url: "" }),
};

export const MAX_BLOCKS = 80;
export const MAX_FLOW_BYTES = 200 * 1024;
export const MAX_NAME = 80;
export const MAX_KEYWORDS = 30;

export const newFlow = (): Flow => ({
  nodes: { start: { id: "start", type: "start", x: 0, y: 0, next: null } },
});

// ---------- saídas dos blocos ----------

const flowBtn = (b: FlowButton) => b.type !== "url" && !!b.label?.trim();

/** Saídas de um bloco: [chave, rótulo]. Chave = next | yes | no | b0..b2. */
export const outs = (n: FlowNode): [string, string][] => {
  if (n.type === "condition") return [["yes", "✅ Tem a tag"], ["no", "❌ Não tem"]];
  if (n.type === "message" && (n.buttons || []).some(flowBtn)) {
    const r: [string, string][] = [];
    (n.buttons || []).forEach((b, i) => {
      if (flowBtn(b)) r.push([`b${i}`, `🔘 ${b.label}`]);
    });
    return r;
  }
  return [["next", n.type === "start" ? "Começa por" : n.type === "delay" ? "Depois da espera" : "Depois"]];
};

export const getOut = (n: FlowNode, k: string): string | null | undefined =>
  /^b\d$/.test(k) ? n.buttons?.[+k[1]]?.next : (n as unknown as Record<string, string | null | undefined>)[k];

export const setOut = (n: FlowNode, k: string, v: string | null): void => {
  if (/^b\d$/.test(k)) {
    const b = n.buttons?.[+k[1]];
    if (b) b.next = v;
  } else {
    (n as unknown as Record<string, string | null>)[k] = v;
  }
};

/** Ids dos blocos alcançáveis a partir do gatilho. */
export const reachable = (nodes: Record<string, FlowNode>): Set<string> => {
  const seen = new Set<string>();
  const q = ["start"];
  while (q.length) {
    const k = q.shift()!;
    if (seen.has(k) || !nodes[k]) continue;
    seen.add(k);
    outs(nodes[k]).forEach(([o]) => {
      const t = getOut(nodes[k], o);
      if (t) q.push(t);
    });
  }
  return seen;
};

/** 1ª letra do tipo + timestamp base36 (ex.: "m" + Date.now().toString(36)). */
export const newNodeId = (type: NodeType): string => type[0] + Date.now().toString(36);

/** Número de blocos exibido na lista (o gatilho não conta). */
export const countBlocks = (flow: Flow | null | undefined): number =>
  Object.values(flow?.nodes || {}).filter((n) => n.type !== "start").length;

// ---------- validação ao salvar (spec §9) ----------

export interface RuleDraft {
  name: string;
  trigger: string;
  keywords?: string[] | null;
  match_type?: string | null;
  post_id?: string | null;
  media_label?: string | null;
  public_replies?: string[] | null;
  flow?: Flow | null;
}

export interface ValidatedRule {
  name: string;
  trigger: Trigger;
  keywords: string[];
  match_type: MatchType;
  post_id: string | null;
  media_label: string | null;
  public_replies: string[];
  flow: Flow;
}

const TRIGGERS: Trigger[] = ["comment", "dm", "story", "mention"];

/**
 * Normaliza a regra e valida. `errors` vazio = pode salvar.
 * - nome obrigatório (≤ 80)
 * - menção zera palavras-chave; post e resposta pública só valem para comentário
 * - gatilho ligado a algum bloco, ou ao menos 1 resposta pública
 * - ≤ 80 blocos, JSON ≤ 200 KB
 */
export function validateRule(draft: RuleDraft): { rule: ValidatedRule; errors: string[] } {
  const errors: string[] = [];
  const name = (draft.name ?? "").trim();
  if (!name) errors.push("Dê um nome ao fluxo.");
  else if (name.length > MAX_NAME) errors.push(`O nome pode ter no máximo ${MAX_NAME} caracteres.`);

  const trigger: Trigger = TRIGGERS.includes(draft.trigger as Trigger) ? (draft.trigger as Trigger) : "comment";
  if (trigger !== draft.trigger) errors.push("Gatilho inválido.");

  let keywords = (draft.keywords ?? []).map((k) => k.trim()).filter(Boolean);
  if (trigger === "mention") keywords = [];
  if (keywords.length > MAX_KEYWORDS) errors.push(`Use no máximo ${MAX_KEYWORDS} palavras-chave.`);

  const isComment = trigger === "comment";
  const post_id = isComment ? draft.post_id?.trim() || null : null;
  const media_label = isComment && post_id ? draft.media_label ?? null : null;
  const public_replies = isComment
    ? (draft.public_replies ?? []).map((r) => r.trim()).filter(Boolean)
    : [];

  const flow: Flow = draft.flow && draft.flow.nodes ? draft.flow : newFlow();
  const nodes = flow.nodes;
  if (!nodes.start) errors.push("O fluxo não tem o bloco de gatilho.");
  const total = countBlocks(flow);
  if (total > MAX_BLOCKS) errors.push(`O fluxo pode ter no máximo ${MAX_BLOCKS} blocos (tem ${total}).`);
  if (!nodes.start?.next && public_replies.length === 0) {
    errors.push("Ligue o gatilho a um bloco ou configure ao menos uma resposta pública.");
  }
  if (new TextEncoder().encode(JSON.stringify(flow)).length > MAX_FLOW_BYTES) {
    errors.push("O fluxo passou de 200 KB.");
  }

  const match_type: MatchType = draft.match_type === "exact" ? "exact" : "contains";
  return {
    rule: { name, trigger, keywords, match_type, post_id, media_label, public_replies, flow },
    errors,
  };
}

// ---------- avisos ao vivo no construtor (spec §10.2) ----------

export interface WarnRule {
  trigger: string;
  public_replies?: string[] | null;
}

const HTTP_RE = /^https?:\/\/\S+/i;

/** Avisos por bloco (id -> mensagens). Bloco sem aviso não aparece no resultado. */
export function nodeWarnings(flow: Flow, rule: WarnRule): Record<string, string[]> {
  const nodes = flow.nodes;
  const out: Record<string, string[]> = {};
  const add = (id: string, msg: string) => (out[id] ||= []).push(msg);
  const reach = reachable(nodes);
  const hasReplies = (rule.public_replies ?? []).some((r) => r.trim());

  for (const n of Object.values(nodes)) {
    if (n.type === "start") {
      if (!n.next && !hasReplies) add(n.id, "Ligue o gatilho a um bloco.");
      continue;
    }
    if (!reach.has(n.id)) add(n.id, "Bloco solto: não está ligado ao fluxo.");
    if (n.type === "message") {
      if (!n.text?.trim() && !n.image?.trim()) add(n.id, "Mensagem sem texto.");
      if ((n.buttons || []).some((b) => b.type === "url" && !HTTP_RE.test((b.url || "").trim()))) {
        add(n.id, "Botão de link sem endereço (http:// ou https://).");
      }
    }
    if (n.type === "delay") {
      const mult = n.unit === "d" ? 24 : n.unit === "min" ? 1 / 60 : 1;
      if ((n.amount || 0) * mult > 23) {
        add(n.id, "Mais de 23h: a Meta só deixa mandar direct até 24h depois da última mensagem da pessoa.");
      }
      if (rule.trigger === "comment" && nodes.start?.next === n.id) {
        add(n.id, "Depois de um comentário, a 1ª mensagem precisa vir antes da espera.");
      }
    }
    if ((n.type === "tag" || n.type === "condition") && !n.tag?.trim()) add(n.id, "Escolha a tag.");
    if (n.type === "webhook" && !HTTP_RE.test((n.url || "").trim())) add(n.id, "Informe a URL do webhook.");
  }
  return out;
}
