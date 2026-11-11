import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERIFY_TOKEN = Deno.env.get("IG_WEBHOOK_VERIFY_TOKEN")!;
const APP_SECRET = Deno.env.get("IG_APP_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---- motor do fluxo: cópia idêntica em instagram-webhook/index.ts ----
const IG_API = "https://graph.instagram.com/v25.0";
const MAX_STEPS = 40;
const UNIT_MS: Record<string, number> = { min: 60e3, h: 3600e3, d: 86400e3 };
const MAX_PRIVATE_REPLIES_PER_HOUR = 750;
const FOLLOW_RECHECK_MS = [20_000, 40_000]; // atraso da 1ª e da 2ª reconferência do follow
const FOLLOW_TEXT_DEFAULT = "Me segue aqui e toque no botão abaixo pra eu te mandar 💛";
const FOLLOW_BUTTON_DEFAULT = "Já estou seguindo ✅";
const FOLLOW_ACK = "Conferindo… 👀";
const READ_FALLBACK_DEFAULT_MIN = 5;
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

// deno-lint-ignore no-explicit-any
type FlowNode = Record<string, any>;
type Rule = {
  id: string;
  name: string;
  active: boolean;
  flow: { nodes?: Record<string, FlowNode> } | null;
};
type Contact = {
  id?: string;
  instagram_user_id: string;
  username?: string | null;
  name?: string | null;
  tags?: string[] | null;
};
// tap: a pessoa acabou de interagir (postback, DM, story); false em comentário e em retomada pelo worker (espera, leitura).
// followCheck: o 1º bloco (Seguir) está sendo reconferido; attempt 0 = toque no botão do pedido, 1 e 2 = reconferências.
type Ctx = {
  c: Contact;
  viaComment?: string | null;
  text?: string | null;
  kind: string;
  tap?: boolean;
  followCheck?: { attempt: number };
};
type Item = {
  kind: string;
  ref: string | null;
  from: string | null;
  username: string | null;
  text: string | null;
  media: string | null;
  payload: string | null;
};

// Conta do Instagram (preenchida por quem chama antes de usar o motor)
const igAccount = { id: "", token: "" };

// Erro da Meta com o código dela (100 = parâmetro inválido, 1 = erro interno, 368/4/17 = limite)
class IgError extends Error {
  status: number;
  code: number | null;
  constructor(status: number, code: number | null, msg: string) {
    super(msg);
    this.status = status;
    this.code = code;
  }
}

async function igPost(path: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${IG_API}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${igAccount.token}` },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  let parsed: unknown = txt;
  try {
    parsed = JSON.parse(txt);
  } catch {
    // resposta não-JSON
  }
  if (!res.ok) {
    const code = (parsed as { error?: { code?: unknown } } | null)?.error?.code;
    throw new IgError(res.status, typeof code === "number" ? code : null, `IG ${res.status}: ${txt.slice(0, 300)}`);
  }
  return parsed;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function fillVars(t: unknown, c: Contact): string {
  return String(t || "")
    .replace(/\{usuario\}/g, c.username ? "@" + c.username : "")
    .replace(/\{nome\}/g, String(c.name || "").trim().split(/\s+/)[0] || "")
    .trim();
}

async function contactOf(igUserId: string): Promise<Contact> {
  const { data } = await supabase.from("ig_contacts").select("*").eq("instagram_user_id", igUserId).maybeSingle();
  if (data) return data as Contact;
  const { data: created } = await supabase
    .from("ig_contacts")
    .upsert({ instagram_user_id: igUserId }, { onConflict: "instagram_user_id" })
    .select("*")
    .single();
  return (created as Contact) ?? { instagram_user_id: igUserId, tags: [] };
}

async function setTag(c: Contact, tag: unknown, add: boolean): Promise<void> {
  const t = String(tag || "").trim().toLowerCase();
  if (!t) return;
  const set = new Set((c.tags || []).map((x) => String(x).trim().toLowerCase()));
  if (add) set.add(t);
  else set.delete(t);
  const tags = [...set];
  const { error } = await supabase
    .from("ig_contacts")
    .update({ tags, updated_at: new Date().toISOString() })
    .eq("instagram_user_id", c.instagram_user_id);
  if (error) throw new Error(error.message);
  c.tags = tags;
}

// Bloqueia SSRF: só http(s) e nada de hosts locais/privados/metadata.
function checkWebhookUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "URL inválida";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "URL deve começar com http:// ou https://";
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const blocked = "Endereço não permitido (host local ou privado)";
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return blocked;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224) return blocked;
  } else if (h.includes(":")) {
    // IPv6 literal: loopback, não especificado, ULA fc00::/7, link-local fe80::/10, IPv4 mapeado
    if (h === "::1" || h === "::" || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith("::ffff:")) return blocked;
  } else if (/^\d+$/.test(h) || /^0x/i.test(h)) {
    return blocked; // IP em formato decimal/hex
  }
  return null;
}

async function fireWebhook(n: FlowNode, rule: Rule, ctx: Ctx): Promise<void> {
  const url = String(n.url || "").trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("URL do webhook inválida");
  const bad = checkWebhookUrl(url);
  if (bad) throw new Error(bad);
  const payload = {
    evento: "instagram.fluxo",
    regra: { id: rule.id, nome: rule.name },
    gatilho: ctx.kind,
    mensagem: ctx.text || "",
    contato: {
      ig_user_id: ctx.c.instagram_user_id,
      usuario: ctx.c.username || null,
      nome: ctx.c.name || null,
      tags: ctx.c.tags || [],
    },
    data: new Date().toISOString(),
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
      redirect: "manual",
    });
    if (!res.ok) throw new Error(`webhook respondeu ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
}


// Consulta se a pessoa segue a conta: true | false | null (a Meta não informou ou a chamada falhou)
async function getUserFollowStatus(igsid: string): Promise<boolean | null> {
  try {
    const res = await fetch(`${IG_API}/${encodeURIComponent(igsid)}?fields=is_user_follow_business`, {
      headers: { Authorization: `Bearer ${igAccount.token}` },
    });
    if (!res.ok) return null;
    const j = await res.json();
    return typeof j?.is_user_follow_business === "boolean" ? j.is_user_follow_business : null;
  } catch {
    return null;
  }
}

function newSlug(): string {
  let s = "";
  while (s.length < 8) {
    for (const b of crypto.getRandomValues(new Uint8Array(16))) {
      if (b < 248 && s.length < 8) s += BASE62[b % 62]; // 248 = 4*62: sem viés
    }
  }
  return s;
}

// Link rastreado do botão: acha ou cria em ig_links e devolve a URL do redirecionador (edge ig-r)
async function trackedUrl(rule: Rule, nodeId: string, idx: number, url: string, igsid: string): Promise<string> {
  const find = async (): Promise<string | undefined> => {
    const { data } = await supabase
      .from("ig_links")
      .select("slug")
      .eq("rule_id", rule.id)
      .eq("node_id", nodeId)
      .eq("button_index", idx)
      .eq("url", url)
      .maybeSingle();
    return (data?.slug as string | undefined) ?? undefined;
  };
  let slug = await find();
  for (let t = 0; !slug && t < 3; t++) {
    const cand = newSlug();
    const { error } = await supabase
      .from("ig_links")
      .insert({ slug: cand, rule_id: rule.id, node_id: nodeId, button_index: idx, url });
    // conflito (outro processo criou o mesmo botão, ou slug repetido): relê e, se preciso, tenta outro slug
    slug = error ? await find() : cand;
  }
  if (!slug) {
    console.error("ig_links: não criou o link rastreado, enviando a URL direta");
    return url;
  }
  return `${SUPABASE_URL}/functions/v1/ig-r?s=${slug}&u=${encodeURIComponent(igsid)}`;
}

// Botões que realmente vão na mensagem: com rótulo (e URL, se for de link), no máximo 3 (limite da Meta)
// deno-lint-ignore no-explicit-any
function sentButtons(n: FlowNode): any[] {
  // deno-lint-ignore no-explicit-any
  return ((n.buttons || []) as any[]).filter((b) => b.label?.trim() && (b.type === "url" ? b.url : true)).slice(0, 3);
}

// Devolve true se caiu no texto simples (a Meta recusou o template): aí os botões de fluxo foram descartados.
// opts.payload: payload interno do (único) botão de postback; o JSON do fluxo nunca define payloads.
// opts.noTextFallback: relança o erro 100 em vez de cair no texto (mensagem cujo botão é indispensável, como o pedido de Seguir).
async function sendMessage(
  rule: Rule,
  n: FlowNode,
  ctx: Ctx,
  opts: { payload?: string; noTextFallback?: boolean } = {},
): Promise<boolean> {
  // 1ª mensagem vinda de comentário vai para o comment_id (mensagem privada); depois, para o id da pessoa
  const to = ctx.viaComment ? { comment_id: ctx.viaComment } : { id: ctx.c.instagram_user_id };
  const text = fillVars(n.text, ctx.c).slice(0, 640);
  // deno-lint-ignore no-explicit-any
  const allButtons: any[] = n.buttons || [];
  const buttons = sentButtons(n);
  if (n.image && !ctx.viaComment) {
    await igPost("me/messages", {
      recipient: to,
      message: { attachment: { type: "image", payload: { url: n.image } } },
    });
  }
  if (!text) return false;
  if (!buttons.length) {
    await igPost("me/messages", { recipient: to, message: { text } });
    return false;
  }
  // URL final de cada botão de link: rastreada (padrão) ou direta
  const urls = new Map<unknown, string>();
  for (const b of buttons) {
    if (b.type !== "url") continue;
    const raw = String(b.url);
    urls.set(
      b,
      b.track === false ? raw : await trackedUrl(rule, String(n.id), allButtons.indexOf(b), raw, ctx.c.instagram_user_id),
    );
  }
  const message = {
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text,
        buttons: buttons.map((b) =>
          b.type === "url"
            ? { type: "web_url", url: urls.get(b), title: String(b.label).slice(0, 20) }
            : {
              type: "postback",
              title: String(b.label).slice(0, 20),
              payload: opts.payload ?? `f:${rule.id}:${n.id}:${allButtons.indexOf(b)}`,
            }
        ),
      },
    },
  };
  try {
    await igPost("me/messages", { recipient: to, message });
    return false;
  } catch (e) {
    // só o código 100 (template recusado) cai no texto; código 1 ou 5xx pode ter entregado: não reenvia
    if (opts.noTextFallback || !(e instanceof IgError) || e.code !== 100) throw e;
    const links = buttons
      .filter((b) => b.type === "url")
      .map((b) => `\n\n${String(b.label).trim()}: ${urls.get(b)}`)
      .join("");
    await igPost("me/messages", { recipient: to, message: { text: text + links } });
    return true;
  }
}

// ---- Seguir ----
async function sendFollowPrompt(rule: Rule, n: FlowNode, ctx: Ctx): Promise<void> {
  const prompt: FlowNode = {
    id: n.id,
    text: String(n.text || "").trim() || FOLLOW_TEXT_DEFAULT,
    buttons: [{ type: "postback", label: String(n.button || "").trim() || FOLLOW_BUTTON_DEFAULT }],
  };
  // Sem o botão a pessoa não tem como avançar: se a Meta recusar o template (código 100) o erro sobe e o fluxo para
  // com o erro registrado (nada de texto sem botão que deixaria a pessoa sem saída).
  await sendMessage(rule, prompt, ctx, { payload: `f:${rule.id}:${n.id}:follow`, noTextFallback: true });
  ctx.viaComment = null;
}

// No máximo uma reconferência "waiting" por regra+pessoa+bloco: confere antes de gravar.
async function scheduleFollowRecheck(rule: Rule, n: FlowNode, ctx: Ctx, attempt: number): Promise<boolean> {
  const uid = ctx.c.instagram_user_id;
  const { data: pending } = await supabase
    .from("ig_flow_runs")
    .select("id")
    .eq("rule_id", rule.id)
    .eq("ig_user_id", uid)
    .eq("node_id", n.id)
    .eq("kind", "follow_recheck")
    .eq("status", "waiting")
    .limit(1);
  if (pending?.length) return false;
  const { error } = await supabase.from("ig_flow_runs").insert({
    rule_id: rule.id,
    ig_user_id: uid,
    node_id: n.id,
    kind: "follow_recheck",
    attempt,
    source_node: n.id,
    resume_at: new Date(Date.now() + FOLLOW_RECHECK_MS[attempt - 1]).toISOString(),
  });
  if (error) throw new Error(error.message);
  return true;
}

async function cancelFollowRechecks(rule: Rule, uid: string, nodeId: string, why: string): Promise<void> {
  await supabase
    .from("ig_flow_runs")
    .update({ status: "done", error: why })
    .eq("rule_id", rule.id)
    .eq("ig_user_id", uid)
    .eq("node_id", nodeId)
    .eq("kind", "follow_recheck")
    .eq("status", "waiting");
}

// ---- Envio após leitura ----
// Guarda o fallback de leitura da mensagem: status 'awaiting_read' até o webhook de leitura da pessoa.
// attempt = minutos de espera depois de ler (o webhook lê de volta); node_id = destino do botão escolhido.
async function armReadFallback(rule: Rule, n: FlowNode, ctx: Ctx): Promise<void> {
  const rf = n.read_fallback;
  if (!rf) return;
  const b = (n.buttons || [])[Number(rf.button)];
  // só vale se o botão foi mesmo enviado (entre os 3 primeiros válidos) e é de fluxo
  if (!b || b.type === "url" || !b.label?.trim() || !b.next || !sentButtons(n).includes(b)) return;
  const minutes = Math.min(60, Math.max(1, Math.round(Number(rf.minutes)) || READ_FALLBACK_DEFAULT_MIN));
  const uid = ctx.c.instagram_user_id;
  await supabase
    .from("ig_flow_runs")
    .update({ status: "done", error: "substituída" })
    .eq("rule_id", rule.id)
    .eq("ig_user_id", uid)
    .eq("source_node", n.id)
    .eq("kind", "read_fallback")
    .in("status", ["awaiting_read", "waiting"]);
  const { error } = await supabase.from("ig_flow_runs").insert({
    rule_id: rule.id,
    ig_user_id: uid,
    node_id: b.next,
    kind: "read_fallback",
    status: "awaiting_read",
    attempt: minutes,
    source_node: n.id,
    resume_at: new Date(Date.now() + 365 * 86400e3).toISOString(),
  });
  if (error) throw new Error(error.message);
}

// Clique em botão da mensagem (ou no botão do pedido de Seguir): cancela o fallback de leitura dela
async function cancelReadFallback(rule: Rule, uid: string, sourceNode: string): Promise<void> {
  await supabase
    .from("ig_flow_runs")
    .update({ status: "done", error: "clicou" })
    .eq("rule_id", rule.id)
    .eq("ig_user_id", uid)
    .eq("source_node", sourceNode)
    .eq("kind", "read_fallback")
    .in("status", ["awaiting_read", "waiting"]);
}

// Executa a partir do bloco "id" até acabar, parar num botão ou numa espera.
// Cada bloco segue mesmo se outro falhar (menos Mensagem, Espera e Seguir: se falham, o fluxo para).
async function run(rule: Rule, startId: string | null | undefined, ctx: Ctx): Promise<string[]> {
  const nodes = rule.flow?.nodes || {};
  const errs: string[] = [];
  let id = startId;
  for (let i = 0; id && i < MAX_STEPS; i++) {
    const n: FlowNode | undefined = nodes[id];
    if (!n) break;
    try {
      if (n.type === "message") {
        const fellBack = await sendMessage(rule, n, ctx);
        ctx.viaComment = null;
        // deno-lint-ignore no-explicit-any
        if (!fellBack && (n.buttons || []).some((b: any) => b.type !== "url" && b.label?.trim())) {
          // espera o clique (ou a leitura, se houver fallback de leitura)
          try {
            await armReadFallback(rule, n, ctx);
          } catch (e) {
            errs.push(`leitura: ${errMsg(e)}`);
          }
          return errs;
        }
        id = n.next; // sem botões de fluxo, ou caiu no texto simples: segue por next
      } else if (n.type === "follow") {
        const fc = i === 0 ? ctx.followCheck : undefined; // reconferência só vale para o bloco inicial
        ctx.followCheck = undefined;
        const uid = ctx.c.instagram_user_id;
        if (!fc && ctx.viaComment) {
          await sendFollowPrompt(rule, n, ctx); // comentário: a Meta ainda não informa o follow
          return errs;
        }
        const st = await getUserFollowStatus(uid);
        // depois do toque, null = segue (quem já segue nunca fica preso); sem toque, só true passa
        if (st === true || (st === null && !!fc && !!ctx.tap)) {
          await cancelFollowRechecks(rule, uid, n.id, "seguiu");
          id = n.yes;
        } else if (!fc) {
          await sendFollowPrompt(rule, n, ctx);
          return errs;
        } else if (fc.attempt < FOLLOW_RECHECK_MS.length) {
          const scheduled = await scheduleFollowRecheck(rule, n, ctx, fc.attempt + 1);
          if (scheduled && fc.attempt === 0) {
            try {
              await igPost("me/messages", { recipient: { id: uid }, message: { text: FOLLOW_ACK } });
            } catch (e) {
              console.error("follow ack:", errMsg(e)); // não fatal
            }
          }
          return errs;
        } else if (n.no) {
          id = n.no;
        } else {
          await sendFollowPrompt(rule, n, ctx);
          return errs;
        }
      } else if (n.type === "delay") {
        if (n.next) {
          const ms = Math.max(1, Number(n.amount) || 1) * (UNIT_MS[n.unit] || UNIT_MS.min);
          const { error } = await supabase.from("ig_flow_runs").insert({
            rule_id: rule.id,
            ig_user_id: ctx.c.instagram_user_id,
            node_id: n.next,
            resume_at: new Date(Date.now() + ms).toISOString(),
          });
          if (error) throw new Error(error.message);
        }
        return errs; // o worker retoma depois
      } else if (n.type === "tag") {
        await setTag(ctx.c, n.tag, n.action !== "remove");
        id = n.next;
      } else if (n.type === "webhook") {
        await fireWebhook(n, rule, ctx);
        id = n.next;
      } else if (n.type === "condition") {
        id = (ctx.c.tags || []).includes(String(n.tag || "").trim().toLowerCase()) ? n.yes : n.no;
      } else break;
    } catch (e) {
      errs.push(`${n.type}: ${errMsg(e)}`);
      if (n.type === "message" || n.type === "delay" || n.type === "follow") return errs;
      id = n.next;
    }
  }
  return errs;
}

// ---- Regras e resposta automática (usado pelo webhook e pela reconciliação do worker) ----
type DbRule = Rule & {
  trigger: string;
  keywords: string[] | null;
  match_type: string | null;
  post_id: string | null;
  public_replies: string[] | null;
  pending_next_reel?: boolean | null;
};

const TRIGGERS: Record<string, string[]> = {
  comment: ["comment"],
  dm: ["dm"],
  story: ["story", "dm"],
  mention: ["mention"],
};
const COOLDOWN_MS: Record<string, number> = {
  comment: 3600e3,
  dm: 12 * 3600e3,
  story: 12 * 3600e3,
  mention: 12 * 3600e3,
};

function fold(s: unknown): string {
  return String(s ?? "").toLowerCase().trim();
}

function matches(rule: DbRule, it: Item, k: string): boolean {
  if (rule.trigger !== k) return false;
  if (rule.pending_next_reel) return false; // esperando o próximo reel: a regra ainda não responde a nada
  if (k === "comment" && rule.post_id && rule.post_id !== it.media) return false;
  const kws = (rule.keywords ?? []).map(fold).filter(Boolean);
  if (k === "mention" || !kws.length || rule.match_type === "any") return true; // sem palavras = qualquer texto
  const text = fold(it.text);
  return rule.match_type === "exact" ? kws.some((x) => text === x) : kws.some((x) => text.includes(x));
}

async function activeRules(): Promise<DbRule[]> {
  const { data, error } = await supabase
    .from("ig_automations")
    .select("*")
    .eq("active", true)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as DbRule[];
}

function pickLine(lines: string[] | null): string {
  const opts = (lines ?? []).map((l) => String(l).trim()).filter(Boolean);
  return opts.length ? opts[Math.floor(Math.random() * opts.length)] : "";
}

async function markReply(id: string, errs: string[]) {
  await supabase
    .from("ig_replies")
    .update({ status: errs.length ? "failed" : "sent", error: errs.join(" | ") || null })
    .eq("id", id);
}

async function autoReply(it: Item) {
  if (!it.ref || !it.from) return; // sem ref não há anti-duplicado: não responde
  const rules = await activeRules();
  let rule: DbRule | undefined;
  for (const k of TRIGGERS[it.kind] ?? []) {
    // regra sem bloco depois do início e sem resposta pública não faz nada: não "consome" o gatilho
    rule = rules.find(
      (r) => (r.flow?.nodes?.start?.next || (r.public_replies ?? []).some((x) => String(x).trim())) && matches(r, it, k),
    );
    if (rule) break;
  }
  if (!rule) return;

  // cooldown: já mandou esta regra para esta pessoa há pouco?
  const since = new Date(Date.now() - COOLDOWN_MS[it.kind]).toISOString();
  const { data: recent } = await supabase
    .from("ig_replies")
    .select("id")
    .eq("ig_user_id", it.from)
    .eq("rule_id", rule.id)
    .eq("status", "sent")
    .gte("created_at", since)
    .limit(1);
  const row = {
    ref: it.ref,
    rule_id: rule.id,
    kind: it.kind,
    ig_user_id: it.from,
    username: it.username,
    text_in: it.text?.slice(0, 500) ?? null,
  };
  if (recent?.length) {
    await supabase.from("ig_replies").insert({ ...row, status: "skipped", error: "já respondida há pouco" });
    return;
  }

  // limite da Meta: 750 mensagens privadas (de comentário) por hora. No limite não reserva o evento:
  // a reconciliação de comentários pega este depois.
  if (it.kind === "comment" && rule.flow?.nodes?.start?.next) {
    const hourAgo = new Date(Date.now() - 3600e3).toISOString();
    const { count } = await supabase
      .from("ig_replies")
      .select("id", { count: "exact", head: true })
      .eq("kind", "comment")
      .in("status", ["sent", "failed"])
      .gte("created_at", hourAgo);
    if ((count ?? 0) >= MAX_PRIVATE_REPLIES_PER_HOUR) {
      await supabase.from("ig_events").insert({
        event_type: "rate_limited",
        payload: { ref: it.ref, ig_user_id: it.from, rule_id: rule.id, sent_last_hour: count },
        processed: true,
      });
      return;
    }
  }

  // "reserva" o evento: se o ref já existe, a Meta reenviou -> sai
  const { data: claimed, error: dup } = await supabase.from("ig_replies").insert(row).select("id").single();
  if (dup || !claimed) {
    if (dup && dup.code !== "23505") console.error("claim ig_replies:", dup.message);
    return;
  }

  const errs: string[] = [];
  const c = await contactOf(it.from);
  if (it.kind === "comment") {
    const pub = fillVars(pickLine(rule.public_replies), c);
    if (pub) {
      try {
        await igPost(`${it.ref}/replies`, { message: pub });
      } catch (e) {
        errs.push("resposta pública: " + errMsg(e));
      }
    }
  }
  if (rule.flow?.nodes?.start?.next) {
    errs.push(
      ...(await run(rule, rule.flow.nodes.start.next, {
        c,
        viaComment: it.kind === "comment" ? it.ref : null,
        text: it.text,
        kind: it.kind,
        tap: it.kind !== "comment",
      }))
    );
  }
  await markReply(claimed.id, errs);
}

// Clique em botão (postback): payload f:<regraId>:<blocoId>:<índiceDoBotão> ou f:<regraId>:<blocoId>:follow
async function onPostback(it: Item) {
  if (!it.from || !it.ref) return;
  const [tag, ruleId, nodeId, idx] = String(it.payload || "").split(":");
  if (tag !== "f" || !ruleId || !nodeId) return;
  const { data } = await supabase.from("ig_automations").select("*").eq("id", ruleId).maybeSingle();
  const rule = data as Rule | null;
  if (!rule?.active) return;
  const node = rule.flow?.nodes?.[nodeId];
  const isFollow = idx === "follow" && node?.type === "follow";
  const btn = isFollow ? null : node?.buttons?.[Number(idx)];
  if (!isFollow && !btn) return;

  // qualquer clique na mensagem (ou no botão do pedido) cancela o "se ler e não tocar"
  await cancelReadFallback(rule, it.from, nodeId);
  if (!isFollow && !btn.next) return;

  // anti-duplicado do clique: ref = "pb:<mid>"
  const { data: claimed, error: dup } = await supabase
    .from("ig_replies")
    .insert({
      ref: `pb:${it.ref}`,
      rule_id: rule.id,
      kind: "postback",
      ig_user_id: it.from,
      username: it.username,
      text_in: String((isFollow ? node?.button : btn.label) ?? "").slice(0, 500),
    })
    .select("id")
    .single();
  if (dup || !claimed) {
    if (dup && dup.code !== "23505") console.error("claim postback:", dup.message);
    return;
  }
  const c = await contactOf(it.from);
  const errs = isFollow
    ? await run(rule, nodeId, { c, text: node?.button, kind: "postback", tap: true, followCheck: { attempt: 0 } })
    : await run(rule, btn.next, { c, text: btn.label, kind: "postback", tap: true });
  await markReply(claimed.id, errs);
}
// ---- fim do motor do fluxo ----

// ---------------------------------------------------------------------------
// Eventos -> itens normalizados
// ---------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
type Any = any;

function msgKind(msg: Any): string {
  if (!msg) return "other";
  if (msg.is_echo) return "echo"; // mensagem enviada pela própria conta
  if (msg.attachments?.some((a: Any) => a.type === "story_mention")) return "mention";
  if (msg.reply_to?.story) return "story";
  return msg.text ? "dm" : "other";
}

function itemsOf(body: Any): Item[] {
  const out: Item[] = [];
  for (const e of body?.entry || []) {
    for (const m of e.messaging || []) {
      out.push({
        kind: m.postback ? "postback" : m.read ? "read" : msgKind(m.message),
        ref: m.message?.mid || m.postback?.mid || m.read?.mid || null,
        from: m.sender?.id || null,
        username: null,
        text: m.message?.text || m.postback?.title || null,
        media: null,
        payload: m.postback?.payload || null,
      });
    }
    for (const c of e.changes || []) {
      const v = c.value || {}; // comentários vêm em "changes"
      out.push({
        kind: c.field === "comments" ? "comment" : c.field === "messages" ? msgKind(v.message) : c.field,
        ref: v.id || v.message?.mid || null,
        from: v.from?.id || v.sender?.id || null,
        username: v.from?.username || null,
        text: v.text || v.message?.text || null,
        media: v.media?.id || null,
        payload: null,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Contato + perfil
// ---------------------------------------------------------------------------
const PROFILE_TTL_MS = 6 * 3600e3;

async function upsertContact(it: Item) {
  const now = new Date().toISOString();
  const row: Record<string, unknown> = { instagram_user_id: it.from, updated_at: now };
  if (it.username) row.username = it.username;
  if (it.kind !== "comment") row.last_in_at = now; // comentário não abre a janela de 24 h
  const { data } = await supabase
    .from("ig_contacts")
    .upsert(row, { onConflict: "instagram_user_id" })
    .select("instagram_user_id, profile_fetched_at")
    .single();

  const fetched = data?.profile_fetched_at ? new Date(data.profile_fetched_at).getTime() : 0;
  if (Date.now() - fetched < PROFILE_TTL_MS) return;
  try {
    const res = await fetch(`${IG_API}/${it.from}?fields=username,name,profile_pic`, {
      headers: { Authorization: `Bearer ${igAccount.token}` },
    });
    if (!res.ok) throw new Error(`perfil ${res.status}`);
    const p = await res.json();
    const upd: Record<string, unknown> = {};
    if (p.username) upd.username = p.username;
    if (p.name) upd.name = p.name;
    if (p.profile_pic) upd.profile_pic = p.profile_pic;
    if (Object.keys(upd).length) await supabase.from("ig_contacts").update(upd).eq("instagram_user_id", it.from);
  } catch (e) {
    console.error("profile fetch failed:", errMsg(e)); // não fatal
  }
  // marca a tentativa mesmo se falhou: não repete a busca a cada evento durante o TTL
  await supabase
    .from("ig_contacts")
    .update({ profile_fetched_at: new Date().toISOString() })
    .eq("instagram_user_id", it.from);
}

// A pessoa leu a conta: os "se ler e não tocar" dela (awaiting_read) começam a contar.
// Os minutos de espera ficam em ig_flow_runs.attempt (gravados quando a mensagem foi enviada).
async function onRead(it: Item) {
  if (!it.from) return;
  const { data } = await supabase
    .from("ig_flow_runs")
    .select("id, attempt")
    .eq("ig_user_id", it.from)
    .eq("kind", "read_fallback")
    .eq("status", "awaiting_read");
  for (const r of data ?? []) {
    const minutes = Math.min(60, Math.max(1, Number(r.attempt) || READ_FALLBACK_DEFAULT_MIN));
    await supabase
      .from("ig_flow_runs")
      .update({ status: "waiting", resume_at: new Date(Date.now() + minutes * 60e3).toISOString() })
      .eq("id", r.id)
      .eq("status", "awaiting_read");
  }
}

async function processItem(it: Item) {
  if (!it.from || it.from === igAccount.id) return; // ignora a própria conta
  if (it.kind === "read") return onRead(it);
  if (it.kind !== "postback" && !TRIGGERS[it.kind]) return; // echo, other, campos desconhecidos
  await upsertContact(it);
  if (it.kind === "postback") await onPostback(it);
  else await autoReply(it);
}

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

Deno.serve(async (req) => {
  // Handshake da Meta (GET)
  if (req.method === "GET") {
    const url = new URL(req.url);
    if (
      url.searchParams.get("hub.mode") === "subscribe" &&
      url.searchParams.get("hub.verify_token") === VERIFY_TOKEN
    ) {
      return new Response(url.searchParams.get("hub.challenge"), { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256") ?? "";

  if (!signature.startsWith("sha256=")) return new Response("Missing signature", { status: 401 });
  const expected = await hmacHex(APP_SECRET, rawBody);
  if (signature.slice(7) !== expected) return new Response("Invalid signature", { status: 401 });

  let body: Any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const { data: ev } = await supabase.from("ig_events").insert({ payload: body, processed: false }).select("id").single();

  const work = (async () => {
    const { data: config } = await supabase.from("ig_config").select("*").limit(1).maybeSingle();
    if (config?.access_token) {
      igAccount.id = config.instagram_user_id;
      igAccount.token = config.access_token;
      for (const it of itemsOf(body)) {
        try {
          await processItem(it);
        } catch (e) {
          console.error("item failed:", it.kind, it.ref, errMsg(e)); // um item ruim não derruba os outros
        }
      }
    }
    if (ev?.id) await supabase.from("ig_events").update({ processed: true }).eq("id", ev.id);
  })().catch((e) => console.error("webhook processing failed:", errMsg(e)));

  // Responde 200 já; o processamento segue em segundo plano (EdgeRuntime.waitUntil ou promise solta)
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);

  // A Meta reenvia em caso de erro e o ref único evita duplicar
  return new Response("OK", { status: 200 });
});
