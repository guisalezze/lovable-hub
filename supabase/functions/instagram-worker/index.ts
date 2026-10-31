import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ---- motor do fluxo: cópia idêntica em instagram-webhook/index.ts ----
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

// Esvazia a fila legada (v1). O webhook v2 não escreve mais em ig_queue; sobram só linhas antigas.
async function drainLegacyQueue(): Promise<void> {
  const igUserId = igAccount.id;
  const token = igAccount.token;
  const now = new Date().toISOString();

  const { data: items } = await supabase
    .from("ig_queue")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_at", now)
    .is("claimed_at", null)
    .order("created_at", { ascending: true })
    .limit(10);

  if (!items?.length) return;

  for (const item of items) {
    // Trava atômica: só um worker ganha por item
    const { data: claimed } = await supabase
      .from("ig_queue")
      .update({ status: "sending", claimed_at: new Date().toISOString() })
      .eq("id", item.id)
      .eq("status", "pending")
      .is("claimed_at", null)
      .select()
      .single();

    if (!claimed) continue;

    try {
      let res: Response;

      if (item.message_type === "public_reply") {
        const body = item.message_body as { comment_id: string; message: string };
        res = await fetch(`${IG_API}/${body.comment_id}/replies`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: body.message, access_token: token }),
        });
      } else {
        res = await fetch(`${IG_API}/${igUserId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...(item.message_body as Record<string, unknown>), access_token: token }),
        });
      }

      if (res.ok) {
        await supabase
          .from("ig_queue")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", item.id);
      } else {
        const errText = await res.text();
        await supabase.from("ig_queue").update({ status: "failed", error: errText }).eq("id", item.id);
      }
    } catch (e: unknown) {
      await supabase.from("ig_queue").update({ status: "failed", error: String(e) }).eq("id", item.id);
    }

    // ~2 req/seg para não estourar rate limit
    await new Promise((r) => setTimeout(r, 500));
  }
}

// Retoma esperas do fluxo (ig_flow_runs) cujo horário já chegou.
async function resumeFlowRuns(): Promise<number> {
  const started = Date.now();
  // Recupera execuções presas em "running" (worker morreu no meio): não retoma, só marca como falha.
  await supabase
    .from("ig_flow_runs")
    .update({ status: "failed", error: "interrompido (timeout do worker)" })
    .eq("status", "running")
    .lt("resume_at", new Date(Date.now() - 10 * 60e3).toISOString());

  const { data: jobs } = await supabase
    .from("ig_flow_runs")
    .select("*")
    .eq("status", "waiting")
    .lte("resume_at", new Date().toISOString())
    .order("resume_at", { ascending: true })
    .limit(20);

  let handled = 0;
  for (const job of jobs ?? []) {
    if (Date.now() - started > 40_000) break; // não começa job novo perto do limite da edge; o resto fica para o próximo minuto
    // Claim atômico: se não atualizou nenhuma linha, outro processo pegou
    const { data: claimed } = await supabase
      .from("ig_flow_runs")
      .update({ status: "running" })
      .eq("id", job.id)
      .eq("status", "waiting")
      .select()
      .maybeSingle();
    if (!claimed) continue;
    handled++;

    try {
      const { data: rule } = job.rule_id
        ? await supabase.from("ig_automations").select("*").eq("id", job.rule_id).maybeSingle()
        : { data: null };
      if (!rule || !rule.active) {
        await supabase
          .from("ig_flow_runs")
          .update({ status: "failed", error: !rule ? "regra apagada" : "regra pausada" })
          .eq("id", job.id);
        continue;
      }
      const c = await contactOf(job.ig_user_id);
      const errs = await run(rule as Rule, job.node_id, { c, kind: "espera" });
      await supabase
        .from("ig_flow_runs")
        .update({ status: errs.length ? "failed" : "done", error: errs.join(" | ") || null })
        .eq("id", job.id);
    } catch (e) {
      await supabase.from("ig_flow_runs").update({ status: "failed", error: errMsg(e) }).eq("id", job.id);
    }
  }
  return handled;
}

Deno.serve(async () => {
  const { data: config } = await supabase.from("ig_config").select("*").limit(1).single();
  if (!config?.access_token) return new Response("No config", { status: 200 });

  igAccount.id = config.instagram_user_id;
  igAccount.token = config.access_token;

  try {
    await drainLegacyQueue();
  } catch (e) {
    console.error("legacy queue failed:", errMsg(e));
  }

  let resumed = 0;
  try {
    resumed = await resumeFlowRuns();
  } catch (e) {
    console.error("flow runs failed:", errMsg(e));
  }

  return new Response(`Done (${resumed} esperas retomadas)`, { status: 200 });
});
