import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Painel do Instagram: só o que precisa do token da Meta.
// Ações (POST JSON { action }): status | posts | webhook_test | set_token
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
          `${GRAPH}/${igUserId}/subscribed_apps?subscribed_fields=messages,comments,messaging_postbacks`,
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

    return json({ error: "Ação desconhecida" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
