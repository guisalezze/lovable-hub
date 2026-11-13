// Motor das campanhas do Instagram (modelo OpenReply, via Zernio).
// Spec: docs/superpowers/specs/2026-11-13-instagram-campanhas-zernio-design.md (seção 3).
// Usado pelo zernio-webhook (normalização + enfileiramento) e pelo ig-campaign-worker (jobs).
//
// Regras gerais:
// - Envio na dúvida não se repete: resultado "não confirmado" vira status `unconfirmed` e o job
//   termina sem erro. Só recusas confirmadas (4xx/429) fazem o job voltar para a fila.
// - Nada de corpo de erro do Zernio em log/banco: só as mensagens seguras de `_shared/zernio.ts`.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  followStatus,
  privateReply,
  publicReply,
  recipientHash,
  sendDm,
  sha256Hex,
  base62,
  type SendResult,
  type ZernioButton,
} from "./zernio.ts";

// ------------------------------------------------------------------------------------------
// Constantes
// ------------------------------------------------------------------------------------------

export const FOLLOW_TEXT_DEFAULT = "Me segue aqui e toque no botão abaixo pra eu te mandar 💛";
export const FOLLOW_BUTTON_DEFAULT = "Já estou seguindo ✅";
export const OPENING_BUTTON_DEFAULT = "Quero receber";
export const LINK_LABEL_DEFAULT = "Abrir link";
export const FOLLOW_ACK = "Conferindo… 👀";
export const USERNAME_FALLBACK = "você";
const EMPTY_MESSAGE_FALLBACK = "Aqui está 👇";

const MAX_ATTEMPTS = 3;
const RATE_REQUEUE_MAX = 3;
const RATE_REQUEUE_MS = 30 * 60_000;
const RECHECK_DELAYS_MS = [20_000, 40_000];
const READ_FALLBACK_MS = 5 * 60_000;
const READ_LOOKBACK_MS = 24 * 3_600_000;

const MSG_RATE_PENDING = "Limite de 750/h; nova tentativa agendada";
const MSG_RATE_SKIPPED = "Limite de 750 respostas privadas por hora atingido";

// ------------------------------------------------------------------------------------------
// Tipos
// ------------------------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
export type Sb = SupabaseClient<any>;

export function serviceClient(): Sb {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface ZernioState {
  profile_id: string | null;
  account_id: string | null;
  ig_user_id: string | null;
  username: string | null;
  webhook_secret: string | null;
  last_reconcile_at: string | null;
}

export async function loadState(sb: Sb): Promise<ZernioState | null> {
  const { data, error } = await sb
    .from("ig_zernio")
    .select("profile_id, account_id, ig_user_id, username, webhook_secret, last_reconcile_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(`ig_zernio: ${error.message}`);
  return (data as ZernioState | null) ?? null;
}

export interface Campaign {
  id: string;
  name: string;
  active: boolean;
  post_mode: "post" | "any" | "next_reel" | "story";
  post_id: string | null;
  post_url: string | null;
  post_label: string | null;
  next_reel_since: string | null;
  keywords: string[];
  match_any: boolean;
  whole_word: boolean;
  dm_trigger: boolean;
  public_reply_enabled: boolean;
  public_replies: string[];
  opening_enabled: boolean;
  opening_message: string | null;
  opening_button: string | null;
  dm_message: string;
  link1_label: string | null;
  link1_url: string | null;
  link2_label: string | null;
  link2_url: string | null;
  require_follow: boolean;
  follow_message: string | null;
  follow_button: string | null;
  followup_enabled: boolean;
  followup_message: string | null;
  followup_delay_min: number;
  created_at: string;
}

export type JobKind = "comment" | "message" | "postback" | "read" | "followup" | "follow_recheck";

export interface JobRow {
  id: number;
  kind: JobKind;
  payload: Record<string, unknown>;
  attempts: number;
  dedupe_key: string | null;
}

interface DmLog {
  id: string;
  campaign_id: string;
  trigger_ref: string;
  status: "pending" | "sent" | "failed" | "skipped_dedup" | "skipped_rate_limit" | "unconfirmed";
  attempts: number;
  public_status: "sent" | "failed" | "unconfirmed" | null;
}

/** Erro que manda o job de volta para a fila (backoff 5/15/45 min no worker). */
export class JobRetry extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobRetry";
  }
}

// ------------------------------------------------------------------------------------------
// Payloads dos jobs
// ------------------------------------------------------------------------------------------

export interface CommentPayload {
  commentId: string;
  mediaId: string | null;
  text: string;
  from: string;
  username: string | null;
  source: "webhook" | "polling";
  /** Quantas vezes já foi reagendado pelo limite de 750/h. */
  requeue?: number;
}

export interface MessagePayload {
  mid: string;
  text: string;
  from: string;
  username: string | null;
  conversationId: string | null;
  story: boolean;
}

export interface PostbackPayload {
  /** `rv:<campaignId>[:open]` | `fc:<campaignId>[:open]` */
  payload: string;
  mid: string | null;
  from: string;
  username: string | null;
  conversationId: string | null;
  /** true = veio do fallback de leitura (job `read`). */
  fallback?: boolean;
}

export interface ReadPayload {
  from: string;
  conversationId?: string | null;
}

export interface FollowupPayload {
  campaignId: string;
  igsid: string;
  username: string | null;
  conversationId: string | null;
}

export interface FollowRecheckPayload {
  campaignId: string;
  igsid: string;
  username: string | null;
  conversationId: string | null;
  attempt: number;
}

// ------------------------------------------------------------------------------------------
// Normalização de eventos do Zernio
// ------------------------------------------------------------------------------------------

export type Ev =
  | { type: "comment"; commentId: string; mediaId: string | null; text: string; from: string; username: string | null }
  | {
      type: "message";
      mid: string;
      text: string;
      from: string;
      username: string | null;
      conversationId: string | null;
      story: boolean;
    }
  | {
      type: "postback";
      payload: string;
      mid: string | null;
      from: string;
      username: string | null;
      conversationId: string | null;
    }
  | { type: "read"; from: string };

export type NormalizeResult = { ev: Ev } | { ignored: string };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string | null =>
  typeof v === "string" && v !== "" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : null;

/** Converte o corpo do webhook do Zernio num evento interno. `state` = linha de ig_zernio. */
export function normalizeEvent(
  body: unknown,
  state: { account_id: string | null; ig_user_id: string | null },
): NormalizeResult {
  const b = obj(body);
  if (!b) return { ignored: "corpo inválido" };
  if (b.test === true) return { ignored: "teste" };
  if (!state.account_id) return { ignored: "sem conta conectada" };
  const account = obj(b.account);
  if (!account || str(account.id) !== state.account_id) return { ignored: "outra conta" };
  if (account.platform !== undefined && account.platform !== "instagram") return { ignored: "outra plataforma" };
  const own = state.ig_user_id;
  const event = str(b.event);

  if (event === "comment.received") {
    const c = obj(b.comment);
    const author = obj(c?.author);
    const commentId = str(c?.id);
    const from = str(author?.id);
    if (!c || !commentId || !from) return { ignored: "comentário incompleto" };
    if (author?.isOwnAccount === true || (own && from === own)) return { ignored: "comentário próprio" };
    return {
      ev: {
        type: "comment",
        commentId,
        mediaId: str(c.platformPostId),
        text: typeof c.text === "string" ? c.text : "",
        from,
        username: str(author?.username),
      },
    };
  }

  if (event === "message.received") {
    const m = obj(b.message);
    if (!m) return { ignored: "mensagem incompleta" };
    if (m.direction !== "incoming") return { ignored: "mensagem enviada" };
    const sender = obj(m.sender);
    const from = str(sender?.id);
    if (!from) return { ignored: "mensagem sem remetente" };
    if (own && from === own) return { ignored: "mensagem própria" };
    const meta = obj(b.metadata) ?? obj(m.metadata) ?? {};
    const mid = str(m.platformMessageId) ?? str(m.id);
    const conversationId = str(m.conversationId) ?? str(obj(b.conversation)?.id);
    const username = str(sender?.username);
    const postback = str(meta.postbackPayload);
    if (postback) {
      return { ev: { type: "postback", payload: postback, mid, from, username, conversationId } };
    }
    if (!mid) return { ignored: "mensagem sem id" };
    return {
      ev: {
        type: "message",
        mid,
        text: typeof m.text === "string" ? m.text : "",
        from,
        username,
        conversationId,
        story: !!meta.storyReply,
      },
    };
  }

  if (event === "message.read") {
    const from = str(obj(b.conversation)?.participantId);
    if (!from) return { ignored: "leitura sem participante" };
    if (own && from === own) return { ignored: "leitura própria" };
    return { ev: { type: "read", from } };
  }

  return { ignored: `evento ${event ?? "?"} não usado` };
}

/** Job que o webhook enfileira para o evento (o `read` não tem dedupe_key). */
export function jobForEvent(ev: Ev): { kind: JobKind; payload: Obj; dedupe_key: string | null } {
  switch (ev.type) {
    case "comment": {
      const payload: CommentPayload = {
        commentId: ev.commentId,
        mediaId: ev.mediaId,
        text: ev.text,
        from: ev.from,
        username: ev.username,
        source: "webhook",
      };
      return { kind: "comment", payload: { ...payload }, dedupe_key: `comment:${ev.commentId}` };
    }
    case "message": {
      const payload: MessagePayload = {
        mid: ev.mid,
        text: ev.text,
        from: ev.from,
        username: ev.username,
        conversationId: ev.conversationId,
        story: ev.story,
      };
      return { kind: "message", payload: { ...payload }, dedupe_key: `message:${ev.mid}` };
    }
    case "postback": {
      const payload: PostbackPayload = {
        payload: ev.payload,
        mid: ev.mid,
        from: ev.from,
        username: ev.username,
        conversationId: ev.conversationId,
      };
      return { kind: "postback", payload: { ...payload }, dedupe_key: ev.mid ? `postback:${ev.mid}` : null };
    }
    case "read": {
      const payload: ReadPayload = { from: ev.from };
      return { kind: "read", payload: { ...payload }, dedupe_key: null };
    }
  }
}

// ------------------------------------------------------------------------------------------
// Palavras-chave (porta do keyword-matcher do OpenReply, foco em PT/latim)
// ------------------------------------------------------------------------------------------

/** Minúsculas, sem acento latino, sem emoji/símbolos (mantém letras, números e marcas). */
export function normalizeForMatch(input: string): string {
  const s = (input ?? "")
    .normalize("NFD")
    .replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Palavras "numéricas" (têm dígito e só dígitos/o): o -> 0 (ex.: "1o0" = "100").
  return s
    .split(" ")
    .map((t) => (/^[0-9o]*[0-9][0-9o]*$/.test(t) ? t.replace(/o/g, "0") : t))
    .join(" ");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Devolve a 1ª palavra (como cadastrada) que bate no texto, ou null. */
export function matchKeyword(text: string, keywords: string[], wholeWord: boolean): string | null {
  const t = normalizeForMatch(text);
  if (!t) return null;
  for (const kw of keywords ?? []) {
    const k = normalizeForMatch(kw);
    if (!k) continue;
    if (wholeWord) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(k)}(?![\\p{L}\\p{N}])`, "iu");
      if (re.test(t)) return kw;
    } else if (t.includes(k)) {
      return kw;
    }
  }
  return null;
}

/** Resultado do casamento de uma campanha com um texto. */
export function campaignMatchesText(
  c: Pick<Campaign, "keywords" | "match_any" | "whole_word">,
  text: string,
): { matched: boolean; keyword: string | null } {
  const kw = matchKeyword(text, c.keywords, c.whole_word);
  if (kw) return { matched: true, keyword: kw };
  if (c.match_any) return { matched: true, keyword: null };
  return { matched: false, keyword: null };
}

/** A campanha vale para comentários nesta mídia? (`next_reel` pendente não responde.) */
export function campaignMatchesMedia(c: Pick<Campaign, "post_mode" | "post_id">, mediaId: string | null): boolean {
  if (c.post_mode === "any") return true;
  if (c.post_mode === "story") return false; // só DM e resposta de story
  if (!c.post_id) return false;
  return !!mediaId && c.post_id === mediaId;
}

// ------------------------------------------------------------------------------------------
// Texto e botões
// ------------------------------------------------------------------------------------------

/** Troca `{username}` (fallback "você") e remove `{link}`. */
export function renderText(template: string | null | undefined, username: string | null | undefined): string {
  const name = (username ?? "").trim() || USERNAME_FALLBACK;
  return (template ?? "")
    .replace(/\{username\}/gi, () => name)
    .replace(/\{link\}/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function parsePostback(payload: string): { kind: "rv" | "fc"; campaignId: string; open: boolean } | null {
  const m = /^(rv|fc):([0-9a-fA-F-]{36})(:open)?$/.exec((payload ?? "").trim());
  if (!m) return null;
  return { kind: m[1] as "rv" | "fc", campaignId: m[2].toLowerCase(), open: !!m[3] };
}

// ------------------------------------------------------------------------------------------
// Acesso ao banco
// ------------------------------------------------------------------------------------------

const UNIQUE_VIOLATION = "23505";

function dbFail(where: string, error: { message: string }): never {
  throw new Error(`${where}: ${error.message}`);
}

export async function activeCampaigns(sb: Sb): Promise<Campaign[]> {
  const { data, error } = await sb.from("ig_campaigns").select("*").eq("active", true).order("created_at");
  if (error) dbFail("ig_campaigns", error);
  return (data ?? []) as Campaign[];
}

async function campaignById(sb: Sb, id: string): Promise<Campaign | null> {
  const { data, error } = await sb.from("ig_campaigns").select("*").eq("id", id).maybeSingle();
  if (error) dbFail("ig_campaigns", error);
  return (data as Campaign | null) ?? null;
}

/** Insere um job. Conflito de dedupe_key = já existe (devolve false). */
export async function enqueueJob(
  sb: Sb,
  kind: JobKind,
  payload: Obj,
  dedupeKey: string | null,
  runAt?: Date,
): Promise<boolean> {
  const row: Obj = { kind, payload, dedupe_key: dedupeKey };
  if (runAt) row.run_at = runAt.toISOString();
  const { error } = await sb.from("ig_jobs").insert(row);
  if (!error) return true;
  if (error.code === UNIQUE_VIOLATION) return false;
  dbFail("ig_jobs", error);
}

async function upsertContact(sb: Sb, igsid: string, username: string | null): Promise<void> {
  const now = new Date().toISOString();
  const row: Obj = { instagram_user_id: igsid, updated_at: now, last_reply_at: now };
  if (username) row.username = username;
  const { error } = await sb.from("ig_contacts").upsert(row, { onConflict: "instagram_user_id" });
  if (error) console.warn("ig_contacts:", error.message);
}

async function getLog(sb: Sb, campaignId: string, triggerRef: string): Promise<DmLog | null> {
  const { data, error } = await sb
    .from("ig_dm_logs")
    .select("id, campaign_id, trigger_ref, status, attempts, public_status")
    .eq("campaign_id", campaignId)
    .eq("trigger_ref", triggerRef)
    .maybeSingle();
  if (error) dbFail("ig_dm_logs", error);
  return (data as DmLog | null) ?? null;
}

/** Cria o log (se não existir) e devolve a linha atual. */
async function ensureLog(sb: Sb, row: Obj & { campaign_id: string; trigger_ref: string }): Promise<DmLog> {
  const { error } = await sb
    .from("ig_dm_logs")
    .upsert(row, { onConflict: "campaign_id,trigger_ref", ignoreDuplicates: true });
  if (error) dbFail("ig_dm_logs", error);
  const log = await getLog(sb, row.campaign_id, row.trigger_ref);
  if (!log) throw new Error("ig_dm_logs: log não encontrado depois do upsert");
  return log;
}

async function updateLog(sb: Sb, id: string, patch: Obj): Promise<void> {
  const { error } = await sb.from("ig_dm_logs").update(patch).eq("id", id);
  if (error) dbFail("ig_dm_logs", error);
}

/**
 * Reserva o envio do DM (atômico): passa a `unconfirmed` e soma 1 tentativa, só se ninguém
 * mexeu no log desde a leitura. Se o processo cair no meio do envio o log fica `unconfirmed`
 * e nunca é reenviado (regra "na dúvida não repete").
 */
async function claimLog(sb: Sb, log: DmLog): Promise<boolean> {
  const { data, error } = await sb
    .from("ig_dm_logs")
    .update({ status: "unconfirmed", attempts: log.attempts + 1, error: null })
    .eq("id", log.id)
    .eq("attempts", log.attempts)
    .in("status", ["pending", "failed"])
    .select("id");
  if (error) dbFail("ig_dm_logs", error);
  return (data ?? []).length > 0;
}

/** O DM deste log já foi resolvido (não tenta de novo). */
export function dmDone(log: Pick<DmLog, "status" | "attempts">): boolean {
  return (
    log.status === "sent" ||
    log.status === "unconfirmed" ||
    log.status === "skipped_dedup" ||
    log.status === "skipped_rate_limit" ||
    log.attempts >= MAX_ATTEMPTS
  );
}

function publicVariants(c: Campaign): string[] {
  return (c.public_replies ?? []).map((s) => (s ?? "").trim()).filter(Boolean);
}

/** Para a reconciliação: log já tratado (DM resolvido e resposta pública tentada/desligada). */
export function logHandled(c: Campaign, log: Pick<DmLog, "status" | "attempts" | "public_status">): boolean {
  const publicDone = !c.public_reply_enabled || publicVariants(c).length === 0 || log.public_status !== null;
  return dmDone(log) && publicDone;
}

async function rpcBool(sb: Sb, fn: string): Promise<boolean> {
  const { data, error } = await sb.rpc(fn);
  if (error) dbFail(fn, error);
  return data === true;
}

async function releaseSlot(sb: Sb): Promise<void> {
  const { error } = await sb.rpc("ig_release_slot");
  if (error) console.warn("ig_release_slot:", error.message);
}

// ------------------------------------------------------------------------------------------
// Links rastreados e mensagem final ("revelar")
// ------------------------------------------------------------------------------------------

interface TrackedLink {
  id: string;
  position: number;
  slug: string;
  url: string;
}

/**
 * Garante as linhas de ig_tracked_links da campanha (o front só lê essa tabela; quem cria é o
 * motor, com a service key). Mantém o slug quando a URL muda (atualiza a URL).
 */
export async function ensureTrackedLinks(sb: Sb, c: Campaign): Promise<Array<TrackedLink & { label: string }>> {
  const wanted = [
    { position: 1, url: (c.link1_url ?? "").trim(), label: (c.link1_label ?? "").trim() || LINK_LABEL_DEFAULT },
    { position: 2, url: (c.link2_url ?? "").trim(), label: (c.link2_label ?? "").trim() || LINK_LABEL_DEFAULT },
  ].filter((w) => /^https?:\/\//i.test(w.url));
  if (wanted.length === 0) return [];

  const load = async (): Promise<TrackedLink[]> => {
    const { data, error } = await sb
      .from("ig_tracked_links")
      .select("id, position, slug, url")
      .eq("campaign_id", c.id);
    if (error) dbFail("ig_tracked_links", error);
    return (data ?? []) as TrackedLink[];
  };

  let existing = await load();
  const out: Array<TrackedLink & { label: string }> = [];
  for (const w of wanted) {
    let row = existing.find((e) => e.position === w.position);
    if (!row) {
      for (let i = 0; i < 3 && !row; i++) {
        const { data, error } = await sb
          .from("ig_tracked_links")
          .insert({ campaign_id: c.id, position: w.position, slug: base62(10), url: w.url })
          .select("id, position, slug, url")
          .single();
        if (!error) {
          row = data as TrackedLink;
        } else if (error.code === UNIQUE_VIOLATION) {
          // corrida com o editor/outro job (mesma posição) ou slug repetido: relê e tenta de novo
          existing = await load();
          row = existing.find((e) => e.position === w.position);
        } else {
          dbFail("ig_tracked_links", error);
        }
      }
      if (!row) throw new Error("ig_tracked_links: não foi possível criar o link");
    }
    // A linha pode ter vindo do editor (ou de uma corrida) com outra URL: a campanha manda.
    if (row.url !== w.url) {
      const { error } = await sb.from("ig_tracked_links").update({ url: w.url }).eq("id", row.id);
      if (error) dbFail("ig_tracked_links", error);
      row = { ...row, url: w.url };
    }
    out.push({ ...row, label: w.label });
  }
  return out;
}

export function trackedUrl(supabaseUrl: string, slug: string, hash: string | null): string {
  const base = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/ig-r?s=${encodeURIComponent(slug)}`;
  return hash ? `${base}&r=${encodeURIComponent(hash)}` : base;
}

interface Content {
  kind: "opening" | "follow" | "reveal";
  message: string;
  buttons?: ZernioButton[];
}

/** Mensagem final: `dm_message` com {username}; links viram botões url (até 2) via ig-r. */
export async function buildReveal(ctx: Ctx, c: Campaign, igsid: string, username: string | null): Promise<Content> {
  const links = await ensureTrackedLinks(ctx.sb, c);
  const message = renderText(c.dm_message, username) || EMPTY_MESSAGE_FALLBACK;
  if (links.length === 0) return { kind: "reveal", message };
  const secret = ctx.state.webhook_secret;
  const hash = secret ? await recipientHash(secret, igsid) : null;
  const buttons: ZernioButton[] = links.map((l) => ({
    type: "url",
    title: l.label,
    url: trackedUrl(ctx.supabaseUrl, l.slug, hash),
  }));
  return { kind: "reveal", message, buttons };
}

function followPrompt(c: Campaign, username: string | null): Content {
  return {
    kind: "follow",
    message: renderText(c.follow_message, username) || FOLLOW_TEXT_DEFAULT,
    buttons: [
      { type: "postback", title: (c.follow_button ?? "").trim() || FOLLOW_BUTTON_DEFAULT, payload: `fc:${c.id}` },
    ],
  };
}

function openingMessage(c: Campaign, username: string | null): Content {
  return {
    kind: "opening",
    message: renderText(c.opening_message, username) || EMPTY_MESSAGE_FALLBACK,
    buttons: [
      {
        type: "postback",
        title: (c.opening_button ?? "").trim() || OPENING_BUTTON_DEFAULT,
        payload: `${c.require_follow ? "fc" : "rv"}:${c.id}:open`,
      },
    ],
  };
}

async function scheduleFollowup(
  ctx: Ctx,
  c: Campaign,
  igsid: string,
  username: string | null,
  conversationId: string | null,
): Promise<void> {
  if (!c.followup_enabled || !(c.followup_message ?? "").trim()) return;
  const payload: FollowupPayload = { campaignId: c.id, igsid, username, conversationId };
  const runAt = new Date(Date.now() + Math.max(0, c.followup_delay_min ?? 0) * 60_000);
  await enqueueJob(ctx.sb, "followup", { ...payload }, `followup:${c.id}:${igsid}`, runAt);
}

// ------------------------------------------------------------------------------------------
// Execução dos jobs
// ------------------------------------------------------------------------------------------

export interface Ctx {
  sb: Sb;
  state: ZernioState;
  supabaseUrl: string;
  job: JobRow;
}

/** Processa um job. Lança erro para o worker reagendar (backoff); retorno normal = concluído. */
export async function runJob(ctx: Ctx): Promise<void> {
  if (!ctx.state.account_id) return; // sem conta conectada: nada a fazer
  switch (ctx.job.kind) {
    case "comment":
      return await handleComment(ctx, ctx.job.payload as unknown as CommentPayload);
    case "message":
      return await handleMessage(ctx, ctx.job.payload as unknown as MessagePayload);
    case "postback":
      return await handlePostback(ctx, ctx.job.payload as unknown as PostbackPayload);
    case "read":
      return await handleRead(ctx, ctx.job.payload as unknown as ReadPayload);
    case "followup":
      return await handleFollowup(ctx, ctx.job.payload as unknown as FollowupPayload);
    case "follow_recheck":
      return await handleFollowRecheck(ctx, ctx.job.payload as unknown as FollowRecheckPayload);
  }
}

function resultPatch(res: SendResult): Obj {
  if (res.ok) return { status: "sent", sent_at: new Date().toISOString(), error: null };
  if (res.confirmed) return { status: "failed", error: res.message };
  return { status: "unconfirmed", error: res.message };
}

/** Recusa confirmada que vale repetir mais tarde. */
/** Como resultPatch, mas recusa que não adianta repetir esgota as tentativas (a reconciliação não reenfileira). */
function finalPatch(res: SendResult): Obj {
  const patch = resultPatch(res);
  if (!res.ok && res.confirmed && !retryable(res)) patch.attempts = MAX_ATTEMPTS;
  return patch;
}

type SendFailure = Extract<SendResult, { ok: false }>;

function retryable(res: SendResult): res is SendFailure {
  return !res.ok && res.confirmed && !res.windowClosed && !res.privateReplyConsumed && res.code !== "missing_key";
}

// ---- comentário --------------------------------------------------------------------------

async function handleComment(ctx: Ctx, p: CommentPayload): Promise<void> {
  const { sb, state } = ctx;
  const accountId = state.account_id as string;
  if (!p?.commentId || !p.from) return;
  const campaigns = await activeCampaigns(sb);
  let matchedAny = false;
  let needRequeue = false;
  let retryMsg: string | null = null;

  for (const c of campaigns) {
    if (!campaignMatchesMedia(c, p.mediaId)) continue;
    const m = campaignMatchesText(c, p.text ?? "");
    if (!m.matched) continue;
    matchedAny = true;

    // 1. log (um por campanha x comentário)
    let log = await ensureLog(sb, {
      campaign_id: c.id,
      trigger_ref: p.commentId,
      source: p.source === "polling" ? "polling" : "webhook",
      ig_user_id: p.from,
      username: p.username,
      trigger_text: p.text ?? "",
      matched_keyword: m.keyword,
    });
    const variants = publicVariants(c);
    const publicPending =
      c.public_reply_enabled && variants.length > 0 && (log.public_status === null || log.public_status === "failed");
    if (dmDone(log) && !publicPending) continue;

    // 2. resposta pública (independente do DM)
    if (publicPending) await doPublicReply(ctx, log, p, variants);
    if (dmDone(log)) continue;

    // 3. dedupe: o Instagram só aceita 1 resposta privada por comentário
    const { data: others, error: oErr } = await sb
      .from("ig_dm_logs")
      .select("campaign_id")
      .eq("trigger_ref", p.commentId)
      .neq("campaign_id", c.id)
      .in("status", ["sent", "unconfirmed"])
      .limit(1);
    if (oErr) dbFail("ig_dm_logs", oErr);
    if ((others ?? []).length > 0) {
      const otherId = (others as Array<{ campaign_id: string }>)[0].campaign_id;
      const otherName = campaigns.find((x) => x.id === otherId)?.name ?? "outra campanha";
      await updateLog(sb, log.id, {
        status: "skipped_dedup",
        error: `A campanha "${otherName}" já usou a única resposta privada que o Instagram permite neste comentário`,
      });
      continue;
    }

    // 5. escolhe a mensagem (antes do limite e da reserva: buildReveal pode falhar no banco)
    let content: Content;
    if (c.opening_enabled && (c.opening_message ?? "").trim()) {
      content = openingMessage(c, p.username);
    } else if (c.require_follow && (await followStatus(accountId, p.from)) === false) {
      content = followPrompt(c, p.username);
    } else {
      content = await buildReveal(ctx, c, p.from, p.username);
    }

    // 4. limite de 750/h
    if (!(await rpcBool(sb, "ig_take_slot"))) {
      if ((p.requeue ?? 0) < RATE_REQUEUE_MAX) {
        await updateLog(sb, log.id, { status: "pending", error: MSG_RATE_PENDING });
        needRequeue = true;
      } else {
        await updateLog(sb, log.id, { status: "skipped_rate_limit", error: MSG_RATE_SKIPPED });
      }
      continue;
    }

    // reserva atômica do envio (outro job pode estar no mesmo comentário)
    log = (await getLog(sb, c.id, p.commentId)) ?? log;
    if (dmDone(log) || !(await claimLog(sb, log))) {
      await releaseSlot(sb);
      continue;
    }

    // 6. resposta privada
    const res = await privateReply(p.mediaId, p.commentId, accountId, content.message, content.buttons);
    await updateLog(sb, log.id, finalPatch(res));
    if (res.ok) {
      if (content.kind === "reveal") await scheduleFollowup(ctx, c, p.from, p.username, null);
    } else if (res.confirmed) {
      await releaseSlot(sb);
      if (retryable(res) && log.attempts + 1 < MAX_ATTEMPTS) retryMsg = res.message;
    }
  }

  // 7. contato
  if (matchedAny) await upsertContact(sb, p.from, p.username);

  if (needRequeue) {
    const next = (p.requeue ?? 0) + 1;
    const payload: CommentPayload = { ...p, requeue: next };
    await enqueueJob(
      sb,
      "comment",
      { ...payload },
      `comment:${p.commentId}:rq${next}`,
      new Date(Date.now() + RATE_REQUEUE_MS),
    );
  }
  if (retryMsg) throw new JobRetry(retryMsg);
}

async function doPublicReply(ctx: Ctx, log: DmLog, p: CommentPayload, variants: string[]): Promise<void> {
  const { sb } = ctx;
  // reserva atômica: null|failed -> unconfirmed
  const { data, error } = await sb
    .from("ig_dm_logs")
    .update({ public_status: "unconfirmed", public_error: null })
    .eq("id", log.id)
    .or("public_status.is.null,public_status.eq.failed")
    .select("id");
  if (error) dbFail("ig_dm_logs", error);
  if ((data ?? []).length === 0) return;

  const text = renderText(variants[Math.floor(Math.random() * variants.length)], p.username);
  if (!text) {
    await updateLog(sb, log.id, { public_status: "failed", public_error: "Resposta pública vazia" });
    return;
  }
  const res = await publicReply(p.mediaId, p.commentId, ctx.state.account_id as string, text);
  if (res.ok) {
    await updateLog(sb, log.id, { public_status: "sent", public_sent_at: new Date().toISOString(), public_error: null });
  } else if (res.confirmed) {
    await updateLog(sb, log.id, { public_status: "failed", public_error: res.message });
  } else {
    await updateLog(sb, log.id, { public_status: "unconfirmed", public_error: res.message });
  }
}

/**
 * Chave de idempotência do envio: estável para o mesmo job (um job recuperado depois de cair
 * no meio do envio reusa a chave e o Zernio não manda de novo). `payload.gen` só muda quando o
 * worker reagenda por recusa confirmada (JobRetry), para a nova tentativa não receber a
 * resposta antiga guardada pelo Zernio.
 */
function opKey(ctx: Ctx, c: Campaign, op: string): string {
  const gen = Number((ctx.job.payload as Obj).gen) || 0;
  return `${ctx.job.id}:${c.id}:${op}:g${gen}`;
}

// ---- revelar por DM (toque, DM, reconferência, fallback de leitura) ----------------------

async function revealByDm(
  ctx: Ctx,
  c: Campaign,
  igsid: string,
  username: string | null,
  conversationId: string | null,
  source: "button" | "read",
  quietWindowClosed: boolean,
): Promise<SendResult> {
  const { sb, state } = ctx;
  const content = await buildReveal(ctx, c, igsid, username);
  const res = await sendDm(
    conversationId || igsid,
    state.account_id as string,
    content.message,
    content.buttons,
    opKey(ctx, c, "reveal"),
  );
  if (!res.ok && res.windowClosed && quietWindowClosed) return res;

  const triggerRef = `reveal:${igsid}`;
  const log = await ensureLog(sb, {
    campaign_id: c.id,
    trigger_ref: triggerRef,
    source,
    ig_user_id: igsid,
    username,
    trigger_text: source === "read" ? "(leu a mensagem)" : "(toque no botão)",
  });
  await updateLog(sb, log.id, {
    ...resultPatch(res),
    source,
    attempts: log.attempts + 1,
    ...(username ? { username } : {}),
  });
  if (res.ok) {
    await scheduleFollowup(ctx, c, igsid, username, conversationId);
    await upsertContact(sb, igsid, username);
  }
  return res;
}

async function sendContentDm(ctx: Ctx, c: Campaign, igsid: string, conversationId: string | null, content: Content, op: string) {
  return await sendDm(
    conversationId || igsid,
    ctx.state.account_id as string,
    content.message,
    content.buttons,
    opKey(ctx, c, op),
  );
}

// ---- toque em botão ----------------------------------------------------------------------

async function handlePostback(ctx: Ctx, p: PostbackPayload): Promise<void> {
  const { sb, state } = ctx;
  if (!p?.from || !p.payload) return;
  const parsed = parsePostback(p.payload);
  if (!parsed) return;
  const c = await campaignById(sb, parsed.campaignId);
  if (!c || !c.active) return;
  const igsid = p.from;
  const accountId = state.account_id as string;

  // Fallback de leitura: só se ninguém revelou e (com seguir) se seguir === true.
  if (p.fallback) {
    const rlog = await getLog(sb, c.id, `reveal:${igsid}`);
    if (rlog && (rlog.status === "sent" || rlog.status === "unconfirmed")) return;
    if (c.require_follow && (await followStatus(accountId, igsid)) !== true) return;
    const receipt = await sha256Hex(`${c.id}|${igsid}|read-fallback`);
    if (!(await insertReceipt(sb, receipt))) return;
    const res = await revealByDm(ctx, c, igsid, p.username, p.conversationId, "read", true);
    if (!res.ok && res.confirmed && !res.windowClosed) {
      await deleteReceipt(sb, receipt);
      if (retryable(res)) throw new JobRetry(res.message);
    }
    return;
  }

  const receipt = await sha256Hex(`${c.id}|${igsid}|${p.mid ?? `job:${ctx.job.id}`}`);
  if (!(await insertReceipt(sb, receipt))) return;

  let res: SendResult | null = null;
  try {
    if (parsed.kind === "rv") {
      res = await revealByDm(ctx, c, igsid, p.username, p.conversationId, "button", false);
    } else {
      const follows = await followStatus(accountId, igsid);
      if (follows !== false) {
        // true ou null: libera (fail-open depois do toque)
        res = await revealByDm(ctx, c, igsid, p.username, p.conversationId, "button", false);
      } else if (parsed.open) {
        res = await sendContentDm(ctx, c, igsid, p.conversationId, followPrompt(c, p.username), "follow");
      } else {
        await startRecheck(ctx, c, igsid, p.username, p.conversationId);
      }
    }
  } catch (e) {
    // Erro de banco (ex.: ao montar os links) antes ou logo depois do envio: libera o toque para
    // o job repetir. Se o DM já tinha saído, a repetição usa a mesma chave de idempotência
    // (mesmo job, mesmo `gen`) e o Zernio não manda de novo.
    if (res === null) await deleteReceipt(sb, receipt);
    throw e;
  }
  await upsertContact(sb, igsid, p.username);

  if (res && !res.ok && res.confirmed) {
    await deleteReceipt(sb, receipt);
    if (retryable(res)) throw new JobRetry(res.message);
  }
}

async function insertReceipt(sb: Sb, id: string): Promise<boolean> {
  const { error } = await sb.from("ig_postback_receipts").insert({ id });
  if (!error) return true;
  if (error.code === UNIQUE_VIOLATION) return false;
  dbFail("ig_postback_receipts", error);
}

async function deleteReceipt(sb: Sb, id: string): Promise<void> {
  const { error } = await sb.from("ig_postback_receipts").delete().eq("id", id);
  if (error) console.warn("ig_postback_receipts:", error.message);
}

function recheckKey(campaignId: string, igsid: string, attempt: number): string {
  return `recheck:${campaignId}:${igsid}:${attempt}`;
}

/** 1ª reconferência em 20 s; manda "Conferindo… 👀" só quando agenda de fato. */
async function startRecheck(
  ctx: Ctx,
  c: Campaign,
  igsid: string,
  username: string | null,
  conversationId: string | null,
): Promise<void> {
  const payload: FollowRecheckPayload = { campaignId: c.id, igsid, username, conversationId, attempt: 1 };
  const created = await enqueueJob(
    ctx.sb,
    "follow_recheck",
    { ...payload },
    recheckKey(c.id, igsid, 1),
    new Date(Date.now() + RECHECK_DELAYS_MS[0]),
  );
  if (!created) return; // já há uma reconferência em andamento
  await sendContentDm(ctx, c, igsid, conversationId, { kind: "follow", message: FOLLOW_ACK }, "ack");
}

/** Libera as chaves das reconferências para um próximo toque poder começar outra rodada. */
export async function clearRecheckKeys(sb: Sb, campaignId: string, igsid: string): Promise<void> {
  const keys = RECHECK_DELAYS_MS.map((_, i) => recheckKey(campaignId, igsid, i + 1));
  const { error } = await sb.from("ig_jobs").update({ dedupe_key: null }).in("dedupe_key", keys);
  if (error) console.warn("ig_jobs (recheck):", error.message);
}

async function handleFollowRecheck(ctx: Ctx, p: FollowRecheckPayload): Promise<void> {
  const { sb, state } = ctx;
  if (!p?.campaignId || !p.igsid) return;
  const c = await campaignById(sb, p.campaignId);
  if (!c || !c.active) {
    await clearRecheckKeys(sb, p.campaignId, p.igsid);
    return;
  }
  const attempt = Math.max(1, Number(p.attempt) || 1);
  const follows = await followStatus(state.account_id as string, p.igsid);

  if (follows === false && attempt < RECHECK_DELAYS_MS.length) {
    const next: FollowRecheckPayload = { ...p, attempt: attempt + 1 };
    await enqueueJob(
      sb,
      "follow_recheck",
      { ...next },
      recheckKey(c.id, p.igsid, attempt + 1),
      new Date(Date.now() + RECHECK_DELAYS_MS[attempt]),
    );
    return;
  }

  let res: SendResult;
  if (follows === false) {
    // última reconferência ainda "não segue": reenvia o pedido
    res = await sendContentDm(ctx, c, p.igsid, p.conversationId, followPrompt(c, p.username), "follow-again");
  } else {
    res = await revealByDm(ctx, c, p.igsid, p.username, p.conversationId, "button", false);
  }
  if (!res.ok && retryable(res)) throw new JobRetry(res.message);
  await clearRecheckKeys(sb, c.id, p.igsid);
}

// ---- mensagem / resposta de story --------------------------------------------------------

async function handleMessage(ctx: Ctx, p: MessagePayload): Promise<void> {
  const { sb, state } = ctx;
  if (!p?.mid || !p.from) return;
  const campaigns = (await activeCampaigns(sb)).filter((c) => c.dm_trigger);
  for (const c of campaigns) {
    // Em DM/story só palavra de verdade dispara (match_any aqui responderia toda conversa).
    const keyword = matchKeyword(p.text ?? "", c.keywords, c.whole_word);
    if (keyword === null) continue;
    const m = { matched: true, keyword };

    const log = await ensureLog(sb, {
      campaign_id: c.id,
      trigger_ref: `dm:${p.mid}`,
      source: "dm",
      ig_user_id: p.from,
      username: p.username,
      trigger_text: p.story ? `(story) ${p.text ?? ""}`.trim() : p.text ?? "",
      matched_keyword: m.keyword,
    });
    if (dmDone(log)) return;
    // Monta a mensagem antes da reserva (buildReveal pode falhar no banco).
    const content =
      c.require_follow && (await followStatus(state.account_id as string, p.from)) === false
        ? followPrompt(c, p.username)
        : await buildReveal(ctx, c, p.from, p.username);
    if (!(await claimLog(sb, log))) return;
    const res = await sendContentDm(ctx, c, p.from, p.conversationId, content, "dm");
    await updateLog(sb, log.id, finalPatch(res));
    await upsertContact(sb, p.from, p.username);
    if (res.ok && content.kind === "reveal") await scheduleFollowup(ctx, c, p.from, p.username, p.conversationId);
    if (retryable(res) && log.attempts + 1 < MAX_ATTEMPTS) throw new JobRetry(res.message);
    // Uma mensagem dispara no máximo uma campanha (evita vários DMs para a mesma mensagem).
    return;
  }
}

// ---- leitura (fallback do DM de abertura) ------------------------------------------------

async function handleRead(ctx: Ctx, p: ReadPayload): Promise<void> {
  const { sb } = ctx;
  if (!p?.from) return;
  const since = new Date(Date.now() - READ_LOOKBACK_MS).toISOString();
  const { data, error } = await sb
    .from("ig_dm_logs")
    .select("campaign_id, trigger_ref")
    .eq("ig_user_id", p.from)
    .eq("status", "sent")
    .gte("created_at", since)
    .not("trigger_ref", "like", "reveal:%")
    .not("trigger_ref", "like", "dm:%")
    .not("trigger_ref", "like", "followup:%");
  if (error) dbFail("ig_dm_logs", error);
  const campaignIds = [...new Set(((data ?? []) as Array<{ campaign_id: string }>).map((r) => r.campaign_id))];
  if (campaignIds.length === 0) return;

  const { data: camps, error: cErr } = await sb
    .from("ig_campaigns")
    .select("id")
    .in("id", campaignIds)
    .eq("active", true)
    .eq("opening_enabled", true);
  if (cErr) dbFail("ig_campaigns", cErr);

  for (const { id } of (camps ?? []) as Array<{ id: string }>) {
    const rlog = await getLog(sb, id, `reveal:${p.from}`);
    if (rlog && (rlog.status === "sent" || rlog.status === "unconfirmed")) continue;
    const payload: PostbackPayload = {
      payload: `rv:${id}`,
      mid: null,
      from: p.from,
      username: null,
      conversationId: p.conversationId ?? null,
      fallback: true,
    };
    await enqueueJob(sb, "postback", { ...payload }, `read:${id}:${p.from}`, new Date(Date.now() + READ_FALLBACK_MS));
  }
}

// ---- follow-up ---------------------------------------------------------------------------

async function handleFollowup(ctx: Ctx, p: FollowupPayload): Promise<void> {
  const { sb } = ctx;
  if (!p?.campaignId || !p.igsid) return;
  const c = await campaignById(sb, p.campaignId);
  if (!c || !c.active || !c.followup_enabled) return;
  const message = renderText(c.followup_message, p.username);
  if (!message) return;
  const res = await sendContentDm(ctx, c, p.igsid, p.conversationId, { kind: "reveal", message }, "followup");
  // Erro só registra (não repete).
  try {
    const log = await ensureLog(sb, {
      campaign_id: c.id,
      trigger_ref: `followup:${p.igsid}`,
      source: "followup",
      ig_user_id: p.igsid,
      username: p.username,
      trigger_text: "(follow-up)",
    });
    await updateLog(sb, log.id, { ...resultPatch(res), attempts: log.attempts + 1 });
  } catch (e) {
    console.warn("followup log:", e instanceof Error ? e.message : String(e));
  }
}
