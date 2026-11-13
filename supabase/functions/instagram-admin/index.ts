import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  connectUrl,
  ensureWebhook,
  hasZernioKey,
  isZernioError,
  listAccounts,
  listConversations,
  listMessages,
  listPosts,
  listProfiles,
  randomHex,
  sendDm,
  ZernioError,
} from "../_shared/zernio.ts";

// Painel do Instagram (Zernio). POST JSON { action, ... }. Exige JWT de usuário do Supabase.
// Ações: status | profiles | set_profile | accounts | connect | select_account | posts |
//        conversations | messages | reply | disconnect
// A chave do Zernio (ZERNIO_API_KEY) e o segredo do webhook nunca saem daqui.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Erro de validação/estado que vira resposta JSON {error} com o status dado. */
class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Zernio -> status HTTP para o navegador (nunca 401: o front trataria como sessão expirada).
function statusFor(e: ZernioError): number {
  switch (e.code) {
    case "missing_key":
      return 503;
    case "payment_required":
      return 402;
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "rate_limited":
      return 429;
    case "window_closed":
      return 409;
    case "client_error":
      return 400;
    default:
      return 502; // unauthorized (chave ruim), network, server_error, bad_response, bad_auth_url
  }
}

const SAFE_ID = /^[A-Za-z0-9_\-=.:]{1,200}$/;

type Cfg = {
  profile_id: string | null;
  account_id: string | null;
  ig_user_id: string | null;
  username: string | null;
  followers_count: number | null;
  webhook_id: string | null;
  webhook_secret: string | null;
  last_worker_at: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // --- autenticação: JWT de usuário válido ---
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ error: "Não autorizado" }, 401);
  const { data: userData, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !userData?.user) return json({ error: "Não autorizado" }, 401);

  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await req.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const action = String(body.action || "");
  const str = (k: string): string => (typeof body[k] === "string" ? (body[k] as string).trim() : "");

  async function loadCfg(): Promise<Cfg> {
    const { data, error } = await supabase
      .from("ig_zernio")
      .select("profile_id, account_id, ig_user_id, username, followers_count, webhook_id, webhook_secret, last_worker_at")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new HttpError(500, "Erro ao ler a configuração do Instagram.");
    return (data as Cfg | null) ?? {
      profile_id: null,
      account_id: null,
      ig_user_id: null,
      username: null,
      followers_count: null,
      webhook_id: null,
      webhook_secret: null,
      last_worker_at: null,
    };
  }

  async function saveCfg(patch: Record<string, unknown>): Promise<void> {
    const { error } = await supabase.from("ig_zernio").upsert({ id: 1, ...patch }, { onConflict: "id" });
    if (error) throw new HttpError(500, "Erro ao salvar a configuração do Instagram.");
  }

  function needAccount(cfg: Cfg): string {
    if (!cfg.account_id) throw new HttpError(400, "Conecte uma conta do Instagram primeiro.");
    return cfg.account_id;
  }

  try {
    switch (action) {
      case "status": {
        const cfg = await loadCfg();
        return json({
          key_set: hasZernioKey(),
          profile_id: cfg.profile_id,
          account: cfg.account_id
            ? { username: cfg.username, ig_user_id: cfg.ig_user_id, followers_count: cfg.followers_count }
            : null,
          webhook_ok: !!(cfg.webhook_id && cfg.webhook_secret),
          last_worker_at: cfg.last_worker_at,
        });
      }

      case "profiles": {
        const profiles = await listProfiles();
        return json({ profiles });
      }

      case "set_profile": {
        const profileId = str("profile_id");
        if (!SAFE_ID.test(profileId)) return json({ error: "Informe o perfil do Zernio." }, 400);
        const profiles = await listProfiles();
        if (!profiles.some((p) => p.id === profileId)) return json({ error: "Perfil não encontrado no Zernio." }, 404);

        const cfg = await loadCfg();
        const secret = cfg.webhook_secret || randomHex(32);
        const webhookId = await ensureWebhook(`${SUPABASE_URL}/functions/v1/zernio-webhook`, secret, cfg.webhook_id);
        const patch: Record<string, unknown> = { profile_id: profileId, webhook_id: webhookId, webhook_secret: secret };
        if (cfg.profile_id && cfg.profile_id !== profileId) {
          // outro perfil: a conta antiga não vale mais
          patch.account_id = null;
          patch.ig_user_id = null;
          patch.username = null;
          patch.followers_count = null;
        }
        await saveCfg(patch);
        return json({ ok: true, profile_id: profileId, webhook_ok: true });
      }

      case "accounts": {
        const cfg = await loadCfg();
        if (!cfg.profile_id) return json({ error: "Escolha um perfil do Zernio primeiro." }, 400);
        const accounts = await listAccounts(cfg.profile_id);
        return json({
          accounts: accounts.map((a) => ({ id: a.id, username: a.username, ig_user_id: a.igUserId, picture: a.picture })),
        });
      }

      case "connect": {
        const cfg = await loadCfg();
        if (!cfg.profile_id) return json({ error: "Escolha um perfil do Zernio primeiro." }, 400);
        const redirect = str("redirect_url");
        const origin = req.headers.get("origin") || "";
        let ru: URL;
        let ou: URL;
        try {
          ru = new URL(redirect);
          ou = new URL(origin);
        } catch {
          return json({ error: "Endereço de retorno inválido." }, 400);
        }
        const secureOk = ru.protocol === "https:" || (ru.protocol === "http:" && ru.hostname === "localhost");
        if (!secureOk || ru.origin !== ou.origin || ru.origin === "null") {
          return json({ error: "Endereço de retorno inválido." }, 400);
        }
        const authUrl = await connectUrl(cfg.profile_id, ru.toString());
        return json({ auth_url: authUrl });
      }

      case "select_account": {
        const accountId = str("account_id");
        if (!SAFE_ID.test(accountId)) return json({ error: "Informe a conta do Instagram." }, 400);
        const cfg = await loadCfg();
        if (!cfg.profile_id) return json({ error: "Escolha um perfil do Zernio primeiro." }, 400);
        const acc = (await listAccounts(cfg.profile_id)).find((a) => a.id === accountId);
        if (!acc) return json({ error: "Conta não encontrada neste perfil do Zernio." }, 404);
        await saveCfg({
          account_id: acc.id,
          ig_user_id: acc.igUserId,
          username: acc.username,
          followers_count: acc.followersCount,
        });
        return json({ ok: true, account: { username: acc.username, ig_user_id: acc.igUserId } });
      }

      case "posts": {
        const accountId = needAccount(await loadCfg());
        const posts = await listPosts(accountId);
        return json({
          posts: posts.map((p) => ({
            id: p.id,
            caption: p.caption,
            permalink: p.permalink,
            is_reel: p.isReel,
            thumbnail: p.thumbnail,
            created_at: p.createdAt,
          })),
        });
      }

      case "conversations": {
        const accountId = needAccount(await loadCfg());
        const convs = await listConversations(accountId);
        return json({
          conversations: convs.map((c) => ({
            id: c.id,
            participant_id: c.participantId,
            username: c.username,
            updated_at: c.updatedAt,
            last_message: c.lastMessage,
          })),
        });
      }

      case "messages": {
        const accountId = needAccount(await loadCfg());
        const convId = str("conversation_id");
        if (!SAFE_ID.test(convId)) return json({ error: "Conversa inválida." }, 400);
        const msgs = await listMessages(convId, accountId); // mais nova primeiro
        return json({
          messages: msgs
            .map((m) => ({
              id: m.id,
              text: m.text,
              from_me: m.direction === "outgoing",
              created_at: m.createdAt,
            }))
            .reverse(), // antiga -> nova
        });
      }

      case "reply": {
        const cfg = await loadCfg();
        const accountId = needAccount(cfg);
        const convId = str("conversation_id");
        if (!SAFE_ID.test(convId)) return json({ error: "Conversa inválida." }, 400);
        const text = typeof body.text === "string" ? body.text.trim() : "";
        if (text.length < 1 || [...text].length > 1000) {
          return json({ error: "A mensagem precisa ter de 1 a 1000 caracteres." }, 400);
        }
        const r = await sendDm(convId, accountId, text, undefined, `admin-reply:${convId}:${crypto.randomUUID()}`);
        if (r.ok) return json({ ok: true, message_id: r.messageId });
        if (r.windowClosed) return json({ error: "Fora da janela de 24 h" }, 409);
        if (!r.confirmed) return json({ error: r.message }, 502);
        const st = r.status === 429 ? 429 : r.status === 402 ? 402 : r.status === 403 ? 403 : r.status === 404 ? 404 : r.status >= 500 ? 502 : 400;
        return json({ error: r.message }, st);
      }

      case "disconnect": {
        await saveCfg({ account_id: null, ig_user_id: null, username: null, followers_count: null });
        return json({ ok: true });
      }

      default:
        return json({ error: "Ação desconhecida." }, 400);
    }
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    if (isZernioError(e)) {
      console.error("instagram-admin zernio:", action, e.code, e.status);
      return json({ error: e.message }, statusFor(e));
    }
    console.error("instagram-admin:", action, e instanceof Error ? e.name : "erro");
    return json({ error: "Erro interno. Tente novamente." }, 500);
  }
});
