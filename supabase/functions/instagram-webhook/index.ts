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

// ---- motor do fluxo: cópia idêntica em instagram-worker/index.ts ----
const IG_API = "https://graph.instagram.com/v25.0";
const MAX_STEPS = 40;
const UNIT_MS: Record<string, number> = { min: 60e3, h: 3600e3, d: 86400e3 };

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
type Ctx = { c: Contact; viaComment?: string | null; text?: string | null; kind: string };

// Conta do Instagram (preenchida por quem chama antes de usar o motor)
const igAccount = { id: "", token: "" };

async function igPost(path: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${IG_API}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${igAccount.token}` },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`IG ${res.status}: ${txt.slice(0, 300)}`);
  try {
    return JSON.parse(txt);
  } catch {
    return txt;
  }
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

async function fireWebhook(n: FlowNode, rule: Rule, ctx: Ctx): Promise<void> {
  const url = String(n.url || "").trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("URL do webhook inválida");
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
    });
    if (!res.ok) throw new Error(`webhook respondeu ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
}

async function sendMessage(rule: Rule, n: FlowNode, ctx: Ctx): Promise<void> {
  // 1ª mensagem vinda de comentário vai para o comment_id (mensagem privada); depois, para o id da pessoa
  const to = ctx.viaComment ? { comment_id: ctx.viaComment } : { id: ctx.c.instagram_user_id };
  const text = fillVars(n.text, ctx.c).slice(0, 640);
  // deno-lint-ignore no-explicit-any
  const allButtons: any[] = n.buttons || [];
  const buttons = allButtons
    .filter((b) => b.label?.trim() && (b.type === "url" ? b.url : true))
    .slice(0, 3);
  if (n.image && !ctx.viaComment) {
    await igPost("me/messages", {
      recipient: to,
      message: { attachment: { type: "image", payload: { url: n.image } } },
    });
  }
  if (!text) return;
  const message = buttons.length
    ? {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text,
          buttons: buttons.map((b) =>
            b.type === "url"
              ? { type: "web_url", url: b.url, title: String(b.label).slice(0, 20) }
              : {
                type: "postback",
                title: String(b.label).slice(0, 20),
                payload: `f:${rule.id}:${n.id}:${allButtons.indexOf(b)}`,
              }
          ),
        },
      },
    }
    : { text };
  await igPost("me/messages", { recipient: to, message });
}

// Executa a partir do bloco "id" até acabar, parar num botão ou numa espera.
// Cada bloco segue mesmo se outro falhar (menos Mensagem: se ela falha, o fluxo para).
async function run(rule: Rule, startId: string | null | undefined, ctx: Ctx): Promise<string[]> {
  const nodes = rule.flow?.nodes || {};
  const errs: string[] = [];
  let id = startId;
  for (let i = 0; id && i < MAX_STEPS; i++) {
    const n: FlowNode | undefined = nodes[id];
    if (!n) break;
    try {
      if (n.type === "message") {
        await sendMessage(rule, n, ctx);
        ctx.viaComment = null;
        // deno-lint-ignore no-explicit-any
        if ((n.buttons || []).some((b: any) => b.type !== "url" && b.label?.trim())) return errs; // espera o clique
        id = n.next;
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
      if (n.type === "message" || n.type === "delay") return errs;
      id = n.next;
    }
  }
  return errs;
}
// ---- fim do motor do fluxo ----

// ---------------------------------------------------------------------------
// Eventos -> itens normalizados
// ---------------------------------------------------------------------------
type Item = {
  kind: string;
  ref: string | null;
  from: string | null;
  username: string | null;
  text: string | null;
  media: string | null;
  payload: string | null;
};

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
        kind: m.postback ? "postback" : msgKind(m.message),
        ref: m.message?.mid || m.postback?.mid || null,
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
// Regras
// ---------------------------------------------------------------------------
type DbRule = Rule & {
  trigger: string;
  keywords: string[] | null;
  match_type: string | null;
  post_id: string | null;
  public_replies: string[] | null;
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

function matches(rule: DbRule, it: Item, k: string): boolean {
  if (rule.trigger !== k) return false;
  if (k === "comment" && rule.post_id && rule.post_id !== it.media) return false;
  const kws = (rule.keywords ?? []).map((x) => String(x).toLowerCase().trim()).filter(Boolean);
  if (k === "mention" || !kws.length || rule.match_type === "any") return true; // sem palavras = qualquer texto
  const text = (it.text ?? "").toLowerCase().trim();
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
    rule = rules.find((r) => matches(r, it, k));
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
      }))
    );
  }
  await markReply(claimed.id, errs);
}

// Clique em botão (postback): payload f:<regraId>:<blocoId>:<índiceDoBotão>
async function onPostback(it: Item) {
  if (!it.from || !it.ref) return;
  const [tag, ruleId, nodeId, idx] = String(it.payload || "").split(":");
  if (tag !== "f" || !ruleId || !nodeId) return;
  const { data } = await supabase.from("ig_automations").select("*").eq("id", ruleId).maybeSingle();
  const rule = data as Rule | null;
  const btn = rule?.active ? rule.flow?.nodes?.[nodeId]?.buttons?.[Number(idx)] : null;
  if (!rule || !btn?.next) return;

  // anti-duplicado do clique: ref = "pb:<mid>"
  const { data: claimed, error: dup } = await supabase
    .from("ig_replies")
    .insert({
      ref: `pb:${it.ref}`,
      rule_id: rule.id,
      kind: "postback",
      ig_user_id: it.from,
      username: it.username,
      text_in: String(btn.label ?? "").slice(0, 500),
    })
    .select("id")
    .single();
  if (dup || !claimed) {
    if (dup && dup.code !== "23505") console.error("claim postback:", dup.message);
    return;
  }
  const errs = await run(rule, btn.next, { c: await contactOf(it.from), text: btn.label, kind: "postback" });
  await markReply(claimed.id, errs);
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
    const upd: Record<string, unknown> = { profile_fetched_at: new Date().toISOString() };
    if (p.username) upd.username = p.username;
    if (p.name) upd.name = p.name;
    if (p.profile_pic) upd.profile_pic = p.profile_pic;
    await supabase.from("ig_contacts").update(upd).eq("instagram_user_id", it.from);
  } catch (e) {
    console.error("profile fetch failed:", errMsg(e)); // não fatal
  }
}

async function processItem(it: Item) {
  if (!it.from || it.from === igAccount.id) return; // ignora a própria conta
  if (it.kind !== "postback" && !TRIGGERS[it.kind]) return; // echo, other, campos desconhecidos
  await upsertContact(it);
  if (it.kind === "postback") await onPostback(it);
  else await autoReply(it);
}

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

  try {
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
  } catch (e) {
    console.error("webhook processing failed:", errMsg(e));
  }

  // Sempre 200: a Meta reenvia em caso de erro e o ref único evita duplicar
  return new Response("OK", { status: 200 });
});
