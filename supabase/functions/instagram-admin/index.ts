import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Painel do Instagram: só o que precisa do token da Meta.
// Ações (POST JSON { action }): status | posts | webhook_test | set_token | conversations | messages | reply
// Exige JWT de usuário do Supabase (Authorization: Bearer ...).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH = "https://graph.instagram.com/v25.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

// --- Inbox (Conversas) ---
const MSG_FIELDS = "messages.limit(20){message,from,created_time}";
const WINDOW_MS = 24 * 60 * 60 * 1000;
// ids de conversa/pessoa vindos do navegador: só caracteres seguros num segmento de URL
const SAFE_ID = /^[A-Za-z0-9_\-=]{1,200}$/;

type GraphMsg = { id?: string; message?: string; created_time?: string; from?: { id?: string; username?: string } };
type GraphError = { message?: string; code?: number; error_subcode?: number };

class GraphFail extends Error {
  constructor(public code: number | undefined, message: string, public status: number) {
    super(message);
  }
}

// Traduz os erros mais comuns da Graph API para algo legível.
function graphMessage(e: GraphError | undefined, status: number): string {
  const code = e?.code;
  const sub = e?.error_subcode;
  if (code === 190) return "Token do Instagram inválido ou expirado. Cole um novo token.";
  if (sub === 2534022 || sub === 2018278) {
    return "Fora da janela de 24 h: a pessoa precisa mandar mensagem primeiro";
  }
  if (code === 551 || sub === 1545041) return "Esta pessoa não está disponível para receber mensagens.";
  if (code === 4 || code === 17 || code === 32 || code === 613) return "Limite de chamadas do Instagram atingido. Tente de novo em alguns minutos.";
  if (code === 10 || code === 200 || code === 3) return `Permissão insuficiente no Instagram: ${e?.message ?? "verifique as permissões do app"}`;
  return `Instagram: ${e?.message || `HTTP ${status}`}`;
}

async function graphGet(path: string, token: string): Promise<Record<string, unknown>> {
  const r = await fetch(`${GRAPH}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new GraphFail(j.error?.code, graphMessage(j.error, r.status), r.status);
  return j;
}

// Última mensagem enviada pela outra pessoa (não pela conta) numa lista da Graph (mais nova primeiro).
function lastFromPerson(msgs: GraphMsg[], ownId: string, ownUsername: string | null): GraphMsg | null {
  const sorted = [...msgs].sort((a, b) => Date.parse(b.created_time ?? "") - Date.parse(a.created_time ?? ""));
  for (const m of sorted) {
    const fid = String(m.from?.id ?? "");
    const fun = m.from?.username ?? null;
    const own = (ownId && fid === ownId) || (ownUsername && fun === ownUsername);
    if (!own) return m;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // --- autenticação: JWT de usuário válido ---
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ error: "Unauthorized" }, 401);
  const { data: userData, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const action = String(body.action || "");

  try {
    if (action === "status") {
      const { data: cfg } = await supabase.from("ig_config").select("*").limit(1).maybeSingle();
      if (!cfg?.access_token) return json({ configured: false, connected: false });
      let username: string | null = cfg.username ?? null;
      let followers: number | null = null;
      let error: string | null = null;
      try {
        const r = await fetch(`${GRAPH}/me?fields=username,followers_count`, {
          headers: { Authorization: `Bearer ${cfg.access_token}` },
        });
        const j = await r.json();
        if (!r.ok || j.error) error = j.error?.message || `HTTP ${r.status}`;
        else {
          username = j.username ?? username;
          followers = typeof j.followers_count === "number" ? j.followers_count : null;
        }
      } catch (e) {
        error = (e as Error).message;
      }
      return json({
        connected: !error,
        configured: true,
        profile_picture_url: cfg.profile_picture_url ?? null,
        username,
        followers,
        token_expires_at: cfg.token_expires_at ?? null,
        error,
      });
    }

    if (action === "posts") {
      const { data: cfg } = await supabase.from("ig_config").select("access_token").limit(1).maybeSingle();
      if (!cfg?.access_token) return json({ error: "Conta não conectada" }, 400);
      const r = await fetch(
        `${GRAPH}/me/media?fields=id,caption,media_type,thumbnail_url,media_url,permalink&limit=30`,
        { headers: { Authorization: `Bearer ${cfg.access_token}` } },
      );
      const j = await r.json();
      if (!r.ok || j.error) return json({ error: j.error?.message || `HTTP ${r.status}` }, 502);
      return json({ posts: j.data ?? [] });
    }

    if (action === "webhook_test") {
      const url = String(body.url || "").trim();
      const bad = checkWebhookUrl(url);
      if (bad) return json({ error: bad }, 400);
      const payload = {
        evento: "instagram.fluxo",
        teste: true,
        regra: { id: "teste", nome: String(body.rule_name || "Teste de fluxo") },
        gatilho: "comment",
        mensagem: "mensagem de teste",
        contato: { ig_user_id: "0000000000", usuario: "usuario_teste", nome: "Fulana de Teste", tags: ["teste"] },
        data: new Date().toISOString(),
      };
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10_000);
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          redirect: "manual", // não segue redirecionamento para hosts internos
          signal: ctrl.signal,
        });
        return json({ ok: r.ok, status: r.status });
      } catch (e) {
        const err = e as Error;
        return json({ ok: false, status: 0, error: err.name === "AbortError" ? "Tempo esgotado (10 s)" : err.message });
      } finally {
        clearTimeout(timer);
      }
    }

    if (action === "set_token") {
      // Token de usuário do Instagram (IGAA...) gerado no painel do app da Meta.
      const token = String(body.token ?? "").trim();
      if (!token) return json({ error: "Cole o token do Instagram." }, 400);
      if (token.length < 20 || token.length > 1000 || /\s/.test(token)) {
        return json({ error: "Token inválido: confira se copiou o token inteiro, sem espaços." }, 400);
      }

      // 1) valida o token e descobre a conta profissional (user_id)
      let igUserId = "";
      let username: string | null = null;
      try {
        const r = await fetch(`${GRAPH}/me?fields=user_id,username`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = await r.json();
        if (!r.ok || j.error) {
          return json({ error: `Token recusado pelo Instagram: ${j.error?.message || `HTTP ${r.status}`}` }, 400);
        }
        igUserId = String(j.user_id || "");
        username = j.username ?? null;
      } catch (e) {
        return json({ error: `Não foi possível validar o token: ${(e as Error).message}` }, 502);
      }
      if (!igUserId) return json({ error: "O Instagram não retornou o ID da conta para este token." }, 400);

      // 2) tenta renovar para um token novo de 60 dias
      let finalToken = token;
      // Estimativa: se a renovação falhar (token com menos de 24 h não pode ser renovado),
      // assume 60 dias. O job diário instagram-token-refresh corrige o valor real depois.
      let expiresInSec = 60 * 24 * 60 * 60;
      try {
        const r = await fetch(
          `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`,
        );
        const j = await r.json();
        if (r.ok && j.access_token) {
          finalToken = String(j.access_token);
          if (typeof j.expires_in === "number" && j.expires_in > 0) expiresInSec = j.expires_in;
        }
      } catch {
        // mantém o token colado
      }
      const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();

      // 3) salva a conta (única) e remove qualquer outra
      const { error: upErr } = await supabase.from("ig_config").upsert(
        {
          instagram_user_id: igUserId,
          username,
          access_token: finalToken,
          token_expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "instagram_user_id" },
      );
      if (upErr) return json({ error: `Erro ao salvar a conta: ${upErr.message}` }, 500);
      const { error: delErr } = await supabase.from("ig_config").delete().neq("instagram_user_id", igUserId);
      const cleanupError = delErr ? delErr.message : undefined;

      // 4) assina o webhook da conta; falha aqui é reportada, não fatal
      let subscribed = false;
      let subscribeError: string | undefined;
      try {
        const r = await fetch(
          `${GRAPH}/${igUserId}/subscribed_apps?subscribed_fields=messages,comments,messaging_postbacks,messaging_seen`,
          { method: "POST", headers: { Authorization: `Bearer ${finalToken}` } },
        );
        const j = await r.json().catch(() => ({}));
        if (r.ok && !j.error && j.success !== false) subscribed = true;
        else subscribeError = j.error?.message || `HTTP ${r.status}`;
      } catch (e) {
        subscribeError = (e as Error).message;
      }

      // nunca devolve o token
      return json({ ok: true, username, subscribed, ...(subscribeError ? { subscribe_error: subscribeError } : {}), ...(cleanupError ? { cleanup_error: cleanupError } : {}) });
    }

    if (action === "conversations" || action === "messages" || action === "reply") {
      const { data: cfg } = await supabase
        .from("ig_config")
        .select("access_token, instagram_user_id, username")
        .limit(1)
        .maybeSingle();
      if (!cfg?.access_token) return json({ error: "Conta não conectada" }, 400);
      const token = String(cfg.access_token);
      const ownId = String(cfg.instagram_user_id ?? "");
      const ownUsername: string | null = cfg.username ?? null;
      const account = { id: ownId, username: ownUsername };

      try {
        if (action === "conversations") {
          const full = "id,updated_time,participants,messages.limit(1){message,from,created_time}";
          try {
            const j = await graphGet(
              `/me/conversations?platform=instagram&fields=${encodeURIComponent(full)}&limit=25`,
              token,
            );
            return json({ account, conversations: j.data ?? [], details_unavailable: false });
          } catch (e) {
            if (!(e instanceof GraphFail) || e.code !== 1) throw e;
            // erro genérico (código 1) com os campos detalhados: tenta só o básico
            const j = await graphGet(`/me/conversations?platform=instagram&fields=id,updated_time&limit=25`, token);
            return json({ account, conversations: j.data ?? [], details_unavailable: true });
          }
        }

        if (action === "messages") {
          const cid = String(body.conversation_id ?? "").trim();
          if (!SAFE_ID.test(cid)) return json({ error: "Conversa inválida" }, 400);
          const j = await graphGet(`/${cid}?fields=${encodeURIComponent(`id,participants,${MSG_FIELDS}`)}`, token);
          const msgs = ((j.messages as { data?: GraphMsg[] } | undefined)?.data ?? []) as GraphMsg[];
          const participants = ((j.participants as { data?: unknown[] } | undefined)?.data ?? []) as unknown[];
          return json({ account, id: cid, participants, messages: msgs });
        }

        // reply
        const recipient = String(body.recipient_id ?? "").trim();
        const text = String(body.text ?? "").trim();
        const cidIn = String(body.conversation_id ?? "").trim();
        if (!SAFE_ID.test(recipient)) return json({ error: "Destinatário inválido" }, 400);
        if (recipient === ownId) return json({ error: "Destinatário inválido" }, 400);
        if (!text) return json({ error: "Escreva a mensagem." }, 400);
        if (text.length > 1000) return json({ error: "Mensagem muito longa (máximo 1000 caracteres)." }, 400);
        if (cidIn && !SAFE_ID.test(cidIn)) return json({ error: "Conversa inválida" }, 400);

        // acha as mensagens da conversa com essa pessoa
        let msgs: GraphMsg[] = [];
        if (cidIn) {
          const j = await graphGet(`/${cidIn}?fields=${encodeURIComponent(`id,participants,${MSG_FIELDS}`)}`, token);
          const parts = ((j.participants as { data?: { id?: string }[] } | undefined)?.data ?? []);
          if (parts.length && !parts.some((p) => String(p.id ?? "") === recipient)) {
            return json({ error: "A pessoa não faz parte desta conversa." }, 400);
          }
          msgs = ((j.messages as { data?: GraphMsg[] } | undefined)?.data ?? []) as GraphMsg[];
        } else {
          const j = await graphGet(
            `/me/conversations?platform=instagram&user_id=${encodeURIComponent(recipient)}&fields=${encodeURIComponent(`id,${MSG_FIELDS}`)}`,
            token,
          );
          const conv = ((j.data as { messages?: { data?: GraphMsg[] } }[] | undefined) ?? [])[0];
          msgs = conv?.messages?.data ?? [];
        }

        const last = lastFromPerson(msgs, ownId, ownUsername);
        const lastAt = last?.created_time ? Date.parse(last.created_time) : NaN;
        if (!last || !Number.isFinite(lastAt) || Date.now() - lastAt > WINDOW_MS) {
          return json({ error: "Fora da janela de 24 h: a pessoa precisa mandar mensagem primeiro", outside_window: true }, 409);
        }

        const r = await fetch(`${GRAPH}/me/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ recipient: { id: recipient }, message: { text } }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.error) {
          return json({ error: graphMessage(j.error, r.status) }, r.status >= 500 ? 502 : 400);
        }
        return json({ ok: true, message_id: j.message_id ?? null });
      } catch (e) {
        if (e instanceof GraphFail) return json({ error: e.message }, e.status >= 500 ? 502 : 400);
        throw e;
      }
    }

    return json({ error: "Ação desconhecida" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
