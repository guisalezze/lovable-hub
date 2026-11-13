// Cliente do Zernio (https://zernio.com/api/v1) usado pelas edge functions do Instagram.
// Spec: docs/superpowers/specs/2026-11-13-instagram-campanhas-zernio-design.md (seção 2).
//
// Regras:
// - A chave vem só de Deno.env.get("ZERNIO_API_KEY"); nunca é logada nem devolvida.
// - Corpos de erro do Zernio nunca são logados, persistidos nem devolvidos (podem ter
//   credenciais da plataforma). Só o status HTTP e alguns sinais seguros são mantidos.
// - Envio na dúvida não se repete: 5xx, erro de rede ou 2xx sem id = "não confirmado".

export const ZERNIO_BASE = "https://zernio.com/api/v1";
const TIMEOUT_MS = 30_000;

export const BUTTON_TITLE_MAX = 20;
export const BUTTON_BODY_MAX = 640;
export const MAX_BUTTONS = 3;

const WEBHOOK_EVENTS = ["comment.received", "message.received", "message.read"] as const;
const WEBHOOK_NAME = "CRM Instagram";
const AUTH_URL_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "facebook.com",
  "www.facebook.com",
  "zernio.com",
]);

// ------------------------------------------------------------------------------------------
// Erros
// ------------------------------------------------------------------------------------------

export type ZernioErrorCode =
  | "missing_key"
  | "unauthorized"
  | "payment_required"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "window_closed"
  | "client_error"
  | "server_error"
  | "network"
  | "bad_response"
  | "bad_auth_url";

export class ZernioError extends Error {
  readonly status: number;
  readonly code: ZernioErrorCode;
  /** true quando sabemos que o Zernio recusou (nada foi enviado). */
  readonly confirmed: boolean;
  /** A resposta privada deste comentário já foi gasta (não repetir). */
  readonly privateReplyConsumed: boolean;

  constructor(
    status: number,
    code: ZernioErrorCode,
    message: string,
    opts: { confirmed?: boolean; privateReplyConsumed?: boolean } = {},
  ) {
    super(message);
    this.name = "ZernioError";
    this.status = status;
    this.code = code;
    this.confirmed = opts.confirmed ?? (status >= 400 && status < 500);
    this.privateReplyConsumed = opts.privateReplyConsumed ?? false;
  }
}

export function isZernioError(e: unknown): e is ZernioError {
  return e instanceof ZernioError;
}

const MSG = {
  missing_key: "Configure o segredo ZERNIO_API_KEY no Supabase.",
  401: "Chave do Zernio inválida ou expirada. Atualize o segredo ZERNIO_API_KEY.",
  402: "O plano do Zernio não inclui acesso ao Inbox.",
  403: "A chave do Zernio precisa ser de leitura e escrita, sem restrição, com acesso ao Inbox.",
  404: "Recurso não encontrado no Zernio.",
  429: "Limite de requisições do Zernio atingido. Tente de novo em alguns minutos.",
  window_closed: "Fora da janela de 24 h",
  network: "Falha de rede ao falar com o Zernio.",
  bad_response: "Resposta inválida do Zernio.",
  bad_auth_url: "O Zernio devolveu um link de conexão inválido.",
  unconfirmed: "Entrega não confirmada. Confira a caixa de entrada do Instagram antes de tentar de novo.",
} as const;

/** Sinais seguros extraídos do corpo de erro (o corpo em si é descartado). */
interface ErrorSignals {
  windowClosed: boolean;
  privateReplyConsumed: boolean;
}

function readSignals(text: string): ErrorSignals {
  let windowClosed = false;
  let privateReplyConsumed = false;
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const details = (j?.details ?? (j?.error as Record<string, unknown> | undefined)?.details) as
      | Record<string, unknown>
      | undefined;
    if (details && details.privateReplyConsumed === true) privateReplyConsumed = true;
    // Códigos da Meta para "fora da janela de mensagens".
    const nums = new Set<number>();
    const collect = (o: unknown, depth: number) => {
      if (!o || typeof o !== "object" || depth > 4) return;
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
        if (typeof v === "number" && /code|subcode/i.test(k)) nums.add(v);
        else if (typeof v === "object") collect(v, depth + 1);
      }
    };
    collect(j, 0);
    if (nums.has(2534022) || nums.has(2018278) || nums.has(2018108)) windowClosed = true;
  } catch {
    // corpo não é JSON: ignora
  }
  if (!windowClosed && /outside (of )?(the )?allowed window|24[ -]?h(our)?s?\s+window|messaging window/i.test(text)) {
    windowClosed = true;
  }
  return { windowClosed, privateReplyConsumed };
}

function errorFor(status: number, signals: ErrorSignals): ZernioError {
  const opts = { privateReplyConsumed: signals.privateReplyConsumed };
  if (status === 401) return new ZernioError(401, "unauthorized", MSG[401], opts);
  if (status === 402) return new ZernioError(402, "payment_required", MSG[402], opts);
  if (status === 403) {
    if (signals.windowClosed) return new ZernioError(403, "window_closed", MSG.window_closed, opts);
    return new ZernioError(403, "forbidden", MSG[403], opts);
  }
  if (status === 404) return new ZernioError(404, "not_found", MSG[404], opts);
  if (status === 429) return new ZernioError(429, "rate_limited", MSG[429], opts);
  if (status >= 400 && status < 500) {
    if (signals.windowClosed) return new ZernioError(status, "window_closed", MSG.window_closed, opts);
    return new ZernioError(status, "client_error", `O Zernio recusou o pedido (HTTP ${status}).`, opts);
  }
  return new ZernioError(status, "server_error", `O Zernio não respondeu corretamente (HTTP ${status}).`, {
    ...opts,
    confirmed: false,
  });
}

// ------------------------------------------------------------------------------------------
// Núcleo HTTP
// ------------------------------------------------------------------------------------------

export function hasZernioKey(): boolean {
  return !!(Deno.env.get("ZERNIO_API_KEY") ?? "").trim();
}

function apiKey(): string {
  const key = (Deno.env.get("ZERNIO_API_KEY") ?? "").trim();
  if (!key) throw new ZernioError(500, "missing_key", MSG.missing_key, { confirmed: true });
  return key;
}

type Query = Record<string, string | number | boolean | null | undefined>;

interface RequestOptions {
  query?: Query;
  body?: unknown;
  idempotencyKey?: string;
}

function buildUrl(path: string, query?: Query): string {
  const url = new URL(ZERNIO_BASE + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

/** Faz a chamada. Lança ZernioError; devolve o JSON (ou undefined em 204 / corpo vazio). */
async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const key = apiKey();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new ZernioError(502, "network", MSG.network, { confirmed: false });
  }

  if (!res.ok) {
    let text = "";
    try {
      text = (await res.text()).slice(0, 20_000);
    } catch {
      text = "";
    }
    const err = errorFor(res.status, readSignals(text));
    text = "";
    throw err;
  }

  if (res.status === 204) return undefined as T;
  let text: string;
  try {
    text = await res.text();
  } catch {
    throw new ZernioError(502, "bad_response", MSG.bad_response, { confirmed: false });
  }
  if (!text.trim()) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ZernioError(502, "bad_response", MSG.bad_response, { confirmed: false });
  }
}

const enc = (s: string) => encodeURIComponent(s);

// ------------------------------------------------------------------------------------------
// Utilidades de texto e botões
// ------------------------------------------------------------------------------------------

/** Corta por code points (não quebra emoji ao meio). */
export function truncate(text: string, max: number): string {
  const chars = Array.from(text ?? "");
  return chars.length <= max ? text ?? "" : chars.slice(0, max).join("");
}

export type ZernioButton =
  | { type: "url"; title: string; url: string }
  | { type: "postback"; title: string; payload: string };

export function normalizeButtons(buttons?: ZernioButton[] | null): ZernioButton[] | undefined {
  if (!buttons || buttons.length === 0) return undefined;
  return buttons.slice(0, MAX_BUTTONS).map((b) =>
    b.type === "url"
      ? { type: "url", title: truncate(b.title, BUTTON_TITLE_MAX), url: b.url }
      : { type: "postback", title: truncate(b.title, BUTTON_TITLE_MAX), payload: b.payload },
  );
}

function messageBody(message: string, buttons?: ZernioButton[]): { message: string; buttons?: ZernioButton[] } {
  const btns = normalizeButtons(buttons);
  if (btns) return { message: truncate(message, BUTTON_BODY_MAX), buttons: btns };
  return { message };
}

// ------------------------------------------------------------------------------------------
// Envios (nunca lançam; devolvem SendResult)
// ------------------------------------------------------------------------------------------

export type SendResult =
  | { ok: true; messageId: string }
  | {
      ok: false;
      /** true = recusa confirmada (4xx/429, nada saiu): pode repetir. false = não repetir. */
      confirmed: boolean;
      status: number;
      message: string;
      code: ZernioErrorCode | "unconfirmed";
      windowClosed: boolean;
      privateReplyConsumed: boolean;
    };

function pickId(result: unknown, field: "messageId" | "commentId"): string | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  const data = (r.data && typeof r.data === "object" ? r.data : {}) as Record<string, unknown>;
  const v = r[field] ?? data[field];
  if (typeof v === "string" && v) return v;
  if (typeof v === "number") return String(v);
  return null;
}

function unconfirmed(status = 502): SendResult {
  return {
    ok: false,
    confirmed: false,
    status,
    message: MSG.unconfirmed,
    code: "unconfirmed",
    windowClosed: false,
    privateReplyConsumed: false,
  };
}

function failure(e: unknown): SendResult {
  if (e instanceof ZernioError) {
    if (!e.confirmed) return unconfirmed(e.status);
    return {
      ok: false,
      confirmed: true,
      status: e.status,
      message: e.message,
      code: e.code,
      windowClosed: e.code === "window_closed",
      privateReplyConsumed: e.privateReplyConsumed,
    };
  }
  return unconfirmed();
}

async function send(
  path: string,
  body: unknown,
  idField: "messageId" | "commentId",
  idempotencyKey?: string,
): Promise<SendResult> {
  try {
    const result = await request<unknown>("POST", path, { body, idempotencyKey });
    const id = pickId(result, idField);
    if (!id) return unconfirmed();
    return { ok: true, messageId: id };
  } catch (e) {
    return failure(e);
  }
}

/** Resposta privada (DM) a um comentário. Uma por comentário, até 7 dias. */
export function privateReply(
  postId: string | null | undefined,
  commentId: string,
  accountId: string,
  message: string,
  buttons?: ZernioButton[],
): Promise<SendResult> {
  const media = postId || commentId;
  return send(
    `/inbox/comments/${enc(media)}/${enc(commentId)}/private-reply`,
    { accountId, ...messageBody(message, buttons) },
    "messageId",
  );
}

/** Resposta pública no comentário. messageId do resultado = id do comentário criado. */
export function publicReply(
  postId: string | null | undefined,
  commentId: string,
  accountId: string,
  message: string,
): Promise<SendResult> {
  const media = postId || commentId;
  return send(`/inbox/comments/${enc(media)}`, { accountId, commentId, message }, "commentId");
}

/**
 * DM para quem já tem conversa (mandou mensagem ou tocou botão).
 * `conversationOrIgsid`: conversationId do webhook quando houver; senão o IGSID.
 * `idempotencyKey`: identificador estável da operação (ex.: `<jobId>:<campaignId>`); o header
 * enviado é sha256(operação|caminho|corpo) em hex.
 */
export async function sendDm(
  conversationOrIgsid: string,
  accountId: string,
  message: string,
  buttons: ZernioButton[] | undefined,
  idempotencyKey: string,
): Promise<SendResult> {
  const path = `/inbox/conversations/${enc(conversationOrIgsid)}/messages`;
  const body = { accountId, ...messageBody(message, buttons) };
  let key: string | undefined;
  try {
    key = await sha256Hex(JSON.stringify({ operationId: idempotencyKey, path, body }));
  } catch {
    key = undefined;
  }
  return send(path, body, "messageId", key);
}

// ------------------------------------------------------------------------------------------
// Perfis, contas, conexão, webhook
// ------------------------------------------------------------------------------------------

export interface ZernioProfile {
  id: string;
  name: string;
}

export async function listProfiles(): Promise<ZernioProfile[]> {
  const r = await request<{ profiles?: Array<{ _id?: string; name?: string }> }>("GET", "/profiles");
  return (r?.profiles ?? [])
    .filter((p) => typeof p?._id === "string" && p._id)
    .map((p) => ({ id: p._id as string, name: p.name ?? "" }));
}

export interface ZernioAccount {
  /** Zernio accountId (`_id`), usado em todas as chamadas. */
  id: string;
  /** Id do Instagram (`platformUserId`). */
  igUserId: string;
  username: string | null;
  displayName: string | null;
  picture: string | null;
  followersCount: number | null;
  profileId: string | null;
}

interface RawAccount {
  _id?: string;
  platform?: string;
  profileId?: string | { _id?: string } | null;
  platformUserId?: string | number | null;
  username?: string | null;
  displayName?: string | null;
  isActive?: boolean;
  profilePicture?: string | null;
  followersCount?: number | null;
}

function mapAccount(a: RawAccount): ZernioAccount {
  const profileId =
    typeof a.profileId === "string" ? a.profileId : (a.profileId && typeof a.profileId === "object" ? a.profileId._id ?? null : null);
  return {
    id: a._id as string,
    igUserId: String(a.platformUserId),
    username: a.username ?? null,
    displayName: a.displayName ?? null,
    picture: a.profilePicture ?? null,
    followersCount: typeof a.followersCount === "number" ? a.followersCount : null,
    profileId,
  };
}

function usableAccount(a: RawAccount | null | undefined): a is RawAccount {
  return (
    !!a &&
    a.platform === "instagram" &&
    a.isActive !== false &&
    typeof a._id === "string" &&
    !!a._id &&
    a.platformUserId !== undefined &&
    a.platformUserId !== null &&
    String(a.platformUserId) !== ""
  );
}

/** Contas Instagram ativas, com platformUserId, do perfil informado. */
export async function listAccounts(profileId: string): Promise<ZernioAccount[]> {
  const r = await request<{ accounts?: RawAccount[] }>("GET", "/accounts", {
    query: { profileId, platform: "instagram" },
  });
  return (r?.accounts ?? [])
    .filter(usableAccount)
    .map(mapAccount)
    .filter((a) => a.profileId === null || a.profileId === profileId);
}

/** Link de autorização para conectar uma conta nova. Valida https + host permitido. */
export async function connectUrl(profileId: string, redirectUrl: string): Promise<string> {
  const r = await request<{ authUrl?: string }>("GET", "/connect/instagram", {
    query: { profileId, redirect_url: redirectUrl },
  });
  const raw = r?.authUrl;
  if (typeof raw !== "string" || !isAllowedAuthUrl(raw)) {
    throw new ZernioError(502, "bad_auth_url", MSG.bad_auth_url, { confirmed: true });
  }
  return raw;
}

export function isAllowedAuthUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && AUTH_URL_HOSTS.has(u.hostname.toLowerCase()) && !u.username && !u.password;
  } catch {
    return false;
  }
}

/**
 * Garante o webhook do CRM no Zernio (procura pelo id salvo ou pela mesma URL; atualiza ou cria).
 * Devolve o `_id` do webhook.
 */
export async function ensureWebhook(url: string, secret: string, existingId?: string | null): Promise<string> {
  const body = { name: WEBHOOK_NAME, url, secret, events: [...WEBHOOK_EVENTS], isActive: true };
  const list = await request<{ webhooks?: Array<{ _id?: string; url?: string }> }>("GET", "/webhooks/settings");
  const hooks = list?.webhooks ?? [];
  const found =
    (existingId ? hooks.find((h) => h?._id === existingId) : undefined) ?? hooks.find((h) => h?.url === url);
  if (found?._id) {
    await request<unknown>("PUT", "/webhooks/settings", { body: { ...body, _id: found._id } });
    return found._id;
  }
  const created = await request<{ webhook?: { _id?: string }; _id?: string; data?: { _id?: string } }>(
    "POST",
    "/webhooks/settings",
    { body },
  );
  const id = created?.webhook?._id ?? created?._id ?? created?.data?._id;
  if (typeof id !== "string" || !id) throw new ZernioError(502, "bad_response", MSG.bad_response, { confirmed: false });
  return id;
}

// ------------------------------------------------------------------------------------------
// Leituras
// ------------------------------------------------------------------------------------------

export interface ZernioPost {
  /** Id da mídia no Instagram (usado como postId). */
  id: string;
  caption: string;
  permalink: string | null;
  isReel: boolean;
  thumbnail: string | null;
  createdAt: string | null;
  mediaType: string | null;
}

/** 25 posts mais recentes (o Zernio não pagina esta lista). */
export async function listPosts(accountId: string): Promise<ZernioPost[]> {
  const r = await request<{
    posts?: Array<{
      id?: string | number;
      message?: string | null;
      createdTime?: string | null;
      picture?: string | null;
      permalink?: string | null;
      mediaType?: string | null;
    }>;
  }>("GET", `/accounts/${enc(accountId)}/posts`);
  return (r?.posts ?? [])
    .filter((p) => p?.id !== undefined && p?.id !== null && String(p.id) !== "")
    .slice(0, 25)
    .map((p) => ({
      id: String(p.id),
      caption: p.message ?? "",
      permalink: p.permalink ?? null,
      isReel: /instagram\.com\/reels?\//i.test(p.permalink ?? ""),
      thumbnail: p.picture ?? null,
      createdAt: p.createdTime ?? null,
      mediaType: p.mediaType ?? null,
    }));
}

export interface ZernioComment {
  id: string;
  text: string;
  createdAt: string | null;
  fromId: string | null;
  username: string | null;
  /** Ids de quem respondeu (para saber se a própria conta já respondeu). */
  replyFromIds: string[];
}

/** Comentários de uma mídia: 100 por página, até 3 páginas. */
export async function listComments(mediaId: string, accountId: string): Promise<ZernioComment[]> {
  const out: ZernioComment[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 3; page++) {
    const r = await request<{
      comments?: Array<{
        id?: string | number;
        message?: string | null;
        createdTime?: string | null;
        from?: { id?: string | number; username?: string | null } | null;
        replies?: Array<{ id?: string | number; from?: { id?: string | number } | null }> | null;
      }>;
      pagination?: { hasMore?: boolean; cursor?: string | null };
    }>("GET", `/inbox/comments/${enc(mediaId)}`, { query: { accountId, limit: 100, cursor } });
    for (const c of r?.comments ?? []) {
      if (c?.id === undefined || c?.id === null) continue;
      out.push({
        id: String(c.id),
        text: c.message ?? "",
        createdAt: c.createdTime ?? null,
        fromId: c.from?.id !== undefined && c.from?.id !== null ? String(c.from.id) : null,
        username: c.from?.username ?? null,
        replyFromIds: (c.replies ?? [])
          .map((x) => (x?.from?.id !== undefined && x?.from?.id !== null ? String(x.from.id) : ""))
          .filter(Boolean),
      });
    }
    const next = r?.pagination?.cursor;
    if (!r?.pagination?.hasMore || !next) break;
    cursor = next;
  }
  return out;
}

/** Segue a conta? true | false | null (desconhecido ou erro). */
export async function followStatus(accountId: string, igsid: string): Promise<boolean | null> {
  try {
    const r = await request<{ isFollower?: boolean | null }>(
      "GET",
      `/accounts/${enc(accountId)}/follow-status/${enc(igsid)}`,
      { query: { refresh: "true" } },
    );
    return typeof r?.isFollower === "boolean" ? r.isFollower : null;
  } catch {
    return null;
  }
}

export interface ZernioConversation {
  id: string;
  participantId: string | null;
  username: string | null;
  updatedAt: string | null;
  lastMessage: string | null;
}

export async function listConversations(accountId: string): Promise<ZernioConversation[]> {
  const r = await request<{
    data?: Array<{
      id?: string;
      participantId?: string | number | null;
      participantUsername?: string | null;
      updatedTime?: string | null;
      lastMessage?: unknown;
    }>;
  }>("GET", "/inbox/conversations", { query: { accountId, limit: 50 } });
  return (r?.data ?? [])
    .filter((c) => typeof c?.id === "string" && c.id)
    .map((c) => ({
      id: c.id as string,
      participantId: c.participantId !== undefined && c.participantId !== null ? String(c.participantId) : null,
      username: c.participantUsername ?? null,
      updatedAt: c.updatedTime ?? null,
      lastMessage: lastMessageText(c.lastMessage),
    }));
}

function lastMessageText(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const t = o.text ?? o.message;
    if (typeof t === "string") return t;
  }
  return null;
}

export interface ZernioMessage {
  id: string;
  text: string | null;
  senderId: string | null;
  direction: string | null;
  createdAt: string | null;
}

/** Últimas 20 mensagens da conversa, como o Zernio devolve (mais nova primeiro). */
export async function listMessages(conversationId: string, accountId: string): Promise<ZernioMessage[]> {
  const r = await request<{
    messages?: Array<{
      id?: string;
      message?: string | null;
      senderId?: string | number | null;
      direction?: string | null;
      createdAt?: string | null;
    }>;
  }>("GET", `/inbox/conversations/${enc(conversationId)}/messages`, {
    query: { accountId, limit: 20, sortOrder: "desc" },
  });
  return (r?.messages ?? [])
    .filter((m) => typeof m?.id === "string" && m.id)
    .map((m) => ({
      id: m.id as string,
      text: m.message ?? null,
      senderId: m.senderId !== undefined && m.senderId !== null ? String(m.senderId) : null,
      direction: m.direction ?? null,
      createdAt: m.createdAt ?? null,
    }));
}

export interface FollowerPoint {
  /** YYYY-MM-DD */
  date: string;
  value: number;
}

/** Histórico de seguidores (padrão 90 dias). */
export async function followerHistory(accountId: string, days = 90): Promise<FollowerPoint[]> {
  const until = new Date();
  const since = new Date(until.getTime() - Math.max(1, days) * 86_400_000);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const r = await request<{
    metrics?: { follower_count?: { values?: Array<{ date?: string; value?: number | null }> } };
  }>("GET", "/analytics/instagram/follower-history", {
    query: {
      accountId,
      metrics: "follower_count",
      metricType: "time_series",
      since: ymd(since),
      until: ymd(until),
    },
  });
  return (r?.metrics?.follower_count?.values ?? [])
    .filter((v) => typeof v?.date === "string" && typeof v?.value === "number")
    .map((v) => ({ date: (v.date as string).slice(0, 10), value: v.value as number }));
}

/** Dados atuais da conta (seguidores podem estar até 24 h atrasados). null se não achar. */
export async function accountInfo(
  accountId: string,
): Promise<{ followersCount: number | null; username: string | null; igUserId: string | null } | null> {
  const r = await request<{ accounts?: RawAccount[] }>("GET", "/accounts", { query: { platform: "instagram" } });
  const a = (r?.accounts ?? []).find((x) => x?._id === accountId);
  if (!a) return null;
  return {
    followersCount: typeof a.followersCount === "number" ? a.followersCount : null,
    username: a.username ?? null,
    igUserId: a.platformUserId !== undefined && a.platformUserId !== null ? String(a.platformUserId) : null,
  };
}

// ------------------------------------------------------------------------------------------
// Criptografia e ids
// ------------------------------------------------------------------------------------------

const te = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function toBase64Url(buf: ArrayBuffer): string {
  let bin = "";
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacRaw(secret: string, data: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", te.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return crypto.subtle.sign("HMAC", key, te.encode(data));
}

/** HMAC-SHA256 em hex minúsculo. */
export async function hmacHex(secret: string, body: string): Promise<string> {
  return toHex(await hmacRaw(secret, body));
}

/** SHA-256 em hex minúsculo. */
export async function sha256Hex(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", te.encode(data)));
}

/** Compara dois hex em tempo constante (ignora maiúsculas). false se tamanhos/formatos diferem. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x.length !== y.length || x.length === 0) return false;
  if (!/^[0-9a-f]+$/.test(x) || !/^[0-9a-f]+$/.test(y)) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

/** Confere o header X-Zernio-Signature (64 hex, sem prefixo) contra o corpo cru. */
export async function verifySignature(secret: string, rawBody: string, signature: string | null): Promise<boolean> {
  if (!secret || !signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  return timingSafeEqualHex(await hmacHex(secret, rawBody), signature);
}

const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** String aleatória base62 de n caracteres (sem viés). */
export function base62(n: number): string {
  let out = "";
  const buf = new Uint8Array(Math.max(16, n * 2));
  while (out.length < n) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < 248) out += B62[b % 62]; // 248 = 62 * 4
      if (out.length >= n) break;
    }
  }
  return out;
}

/** n bytes aleatórios em hex (ex.: webhook_secret = randomHex(32)). */
export function randomHex(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return toHex(buf.buffer);
}

/** Hash do destinatário para links rastreados: 22 chars base64url de HMAC-SHA256(secret, "recipient:<igsid>"). */
export async function recipientHash(secret: string, igsid: string): Promise<string> {
  return toBase64Url(await hmacRaw(secret, `recipient:${igsid}`)).slice(0, 22);
}
