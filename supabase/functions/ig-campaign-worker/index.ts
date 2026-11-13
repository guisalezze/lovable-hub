// Worker das campanhas do Instagram (cron a cada minuto, verify_jwt = false).
// Spec: docs/superpowers/specs/2026-11-13-instagram-campanhas-zernio-design.md (seção 4).
//
// - Laço de ~50 s: ig_claim_jobs(10) -> processa -> dorme 5 s -> repete (as reconferências de
//   seguir em 20/40 s dependem disso).
// - Erro: attempts < 3 -> volta para a fila (+5/15/45 min); senão `failed`.
// - Jobs `running` há > 10 min -> `queued` (ou `dead` com attempts >= 3).
// - Manutenção no máximo a cada 5 min (last_reconcile_at), só com >= 15 s de folga:
//   próximo reel, reconciliação de comentários, seguidores (1x/dia), limpeza.

import {
  accountInfo,
  followerHistory,
  listComments,
  listPosts,
  truncate,
  type ZernioComment,
  type ZernioPost,
} from "../_shared/zernio.ts";
import {
  activeCampaigns,
  campaignMatchesText,
  clearRecheckKeys,
  JobRetry,
  enqueueJob,
  loadState,
  logHandled,
  runJob,
  serviceClient,
  type Campaign,
  type CommentPayload,
  type JobRow,
  type Sb,
  type ZernioState,
} from "../_shared/engine.ts";

const LOOP_MS = 50_000;
const SLEEP_MS = 5_000;
const CLAIM_LIMIT = 3;
/** Não começa um job novo com menos que isto até o fim do laço (envios têm timeout de 30 s). */
const JOB_MIN_LEFT_MS = 5_000;
const BACKOFF_MIN = [5, 15, 45];
const MAX_ATTEMPTS = 3;
const STALE_MS = 10 * 60_000;
const MAINT_EVERY_MS = 5 * 60_000;
const MAINT_MIN_LEFT_MS = 15_000;
const LOOKBACK_MS = 72 * 3_600_000;
const MAX_PER_CAMPAIGN = 30;
const ANY_POST_MEDIA = 10;
const DAY_MS = 86_400_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

// ------------------------------------------------------------------------------------------
// Fila
// ------------------------------------------------------------------------------------------

async function recoverStale(sb: Sb): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  const r1 = await sb
    .from("ig_jobs")
    .update({ status: "queued", locked_at: null, last_error: "Execução interrompida; reagendado" })
    .eq("status", "running")
    .lt("locked_at", cutoff)
    .lt("attempts", MAX_ATTEMPTS);
  if (r1.error) console.error("recoverStale:", r1.error.message);
  const r2 = await sb
    .from("ig_jobs")
    .update({ status: "dead", locked_at: null, last_error: "Execução interrompida 3 vezes" })
    .eq("status", "running")
    .lt("locked_at", cutoff)
    .gte("attempts", MAX_ATTEMPTS)
    .select("kind, payload");
  if (r2.error) console.error("recoverStale:", r2.error.message);
  for (const row of (r2.data ?? []) as Array<Pick<JobRow, "kind" | "payload">>) await releaseRecheck(sb, row);
}

/** follow_recheck que terminou sem sucesso: libera as chaves para um próximo toque funcionar. */
async function releaseRecheck(sb: Sb, job: Pick<JobRow, "kind" | "payload">): Promise<void> {
  if (job.kind !== "follow_recheck") return;
  const campaignId = typeof job.payload?.campaignId === "string" ? job.payload.campaignId : "";
  const igsid = typeof job.payload?.igsid === "string" ? job.payload.igsid : "";
  if (campaignId && igsid) await clearRecheckKeys(sb, campaignId, igsid);
}

async function finishJob(sb: Sb, job: JobRow, error: unknown): Promise<void> {
  let patch: Record<string, unknown>;
  if (error === null) {
    patch = { status: "done", locked_at: null, last_error: null };
  } else if (job.attempts < MAX_ATTEMPTS) {
    const delay = BACKOFF_MIN[Math.min(Math.max(job.attempts, 1), BACKOFF_MIN.length) - 1];
    patch = {
      status: "queued",
      locked_at: null,
      last_error: errMsg(error),
      run_at: new Date(Date.now() + delay * 60_000).toISOString(),
    };
    // Recusa confirmada: a nova tentativa usa outra chave de idempotência (engine opKey).
    // Outros erros (banco) mantêm a chave: se o envio já saiu, o Zernio não repete.
    if (error instanceof JobRetry) {
      patch.payload = { ...job.payload, gen: (Number(job.payload?.gen) || 0) + 1 };
    }
  } else {
    patch = { status: "failed", locked_at: null, last_error: errMsg(error) };
  }
  const { error: upErr } = await sb.from("ig_jobs").update(patch).eq("id", job.id);
  if (upErr) console.error(`ig_jobs ${job.id}:`, upErr.message);
  if (patch.status === "failed") await releaseRecheck(sb, job);
}

/** Devolve um job reservado que não chegou a começar (desfaz a tentativa somada). */
async function unclaim(sb: Sb, job: JobRow): Promise<void> {
  const { error } = await sb
    .from("ig_jobs")
    .update({ status: "queued", locked_at: null, attempts: Math.max(0, job.attempts - 1) })
    .eq("id", job.id)
    .eq("status", "running");
  if (error) console.error(`ig_jobs ${job.id} (devolver):`, error.message);
}

async function processBatch(sb: Sb, state: ZernioState, supabaseUrl: string, deadline: number): Promise<number> {
  const { data, error } = await sb.rpc("ig_claim_jobs", { p_limit: CLAIM_LIMIT });
  if (error) {
    console.error("ig_claim_jobs:", error.message);
    return 0;
  }
  const jobs = (data ?? []) as JobRow[];
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    if (deadline - Date.now() < JOB_MIN_LEFT_MS) {
      for (const rest of jobs.slice(i)) await unclaim(sb, rest);
      break;
    }
    let failure: unknown = null;
    try {
      await runJob({ sb, state, supabaseUrl, job });
    } catch (e) {
      failure = e ?? new Error("erro desconhecido");
    }
    await finishJob(sb, job, failure);
  }
  return jobs.length;
}

// ------------------------------------------------------------------------------------------
// Manutenção
// ------------------------------------------------------------------------------------------

/** Reserva a manutenção (no máximo a cada 5 min, entre execuções concorrentes). */
async function claimMaintenance(sb: Sb): Promise<boolean> {
  const cutoff = new Date(Date.now() - MAINT_EVERY_MS).toISOString();
  const { data, error } = await sb
    .from("ig_zernio")
    .update({ last_reconcile_at: new Date().toISOString() })
    .eq("id", 1)
    .or(`last_reconcile_at.is.null,last_reconcile_at.lt."${cutoff}"`)
    .select("id");
  if (error) {
    console.error("claimMaintenance:", error.message);
    return false;
  }
  return (data ?? []).length > 0;
}

/** Próximo reel: o reel mais antigo publicado depois de next_reel_since. */
async function bindNextReels(sb: Sb, accountId: string, posts: () => Promise<ZernioPost[]>): Promise<void> {
  const { data, error } = await sb
    .from("ig_campaigns")
    .select("id, created_at, next_reel_since")
    .eq("post_mode", "next_reel")
    .is("post_id", null);
  if (error) throw new Error(error.message);
  const pending = (data ?? []) as Array<{ id: string; created_at: string; next_reel_since: string | null }>;
  if (pending.length === 0 || !accountId) return;

  const reels = (await posts())
    .filter((p) => p.isReel && p.createdAt && !Number.isNaN(Date.parse(p.createdAt)))
    .sort((a, b) => Date.parse(a.createdAt as string) - Date.parse(b.createdAt as string));
  for (const c of pending) {
    const since = Date.parse(c.next_reel_since ?? c.created_at);
    const reel = reels.find((r) => Date.parse(r.createdAt as string) > since);
    if (!reel) continue;
    const { error: upErr } = await sb
      .from("ig_campaigns")
      .update({
        post_id: reel.id,
        post_url: reel.permalink,
        post_label: truncate((reel.caption ?? "").replace(/\s+/g, " ").trim(), 80) || null,
      })
      .eq("id", c.id)
      .is("post_id", null);
    if (upErr) console.error("next_reel:", upErr.message);
  }
}

/** Reconciliação: comentários que o webhook pode ter perdido (últimas 72 h). */
async function reconcile(
  sb: Sb,
  state: ZernioState,
  posts: () => Promise<ZernioPost[]>,
  hasTime: () => boolean,
): Promise<number> {
  const accountId = state.account_id as string;
  const own = state.ig_user_id;
  const campaigns = (await activeCampaigns(sb)).filter((c) => c.post_mode === "any" || !!c.post_id);
  const commentsCache = new Map<string, ZernioComment[] | null>();
  const queuedThisRun = new Set<string>();
  const minTime = Date.now() - LOOKBACK_MS;
  let total = 0;

  const commentsOf = async (mediaId: string): Promise<ZernioComment[]> => {
    if (!commentsCache.has(mediaId)) {
      try {
        commentsCache.set(mediaId, await listComments(mediaId, accountId));
      } catch (e) {
        console.warn("listComments:", errMsg(e));
        commentsCache.set(mediaId, null);
      }
    }
    return commentsCache.get(mediaId) ?? [];
  };

  for (const c of campaigns) {
    if (!hasTime()) break;
    let media: string[];
    if (c.post_mode === "any") {
      try {
        media = (await posts()).slice(0, ANY_POST_MEDIA).map((p) => p.id);
      } catch (e) {
        console.warn("listPosts:", errMsg(e));
        continue;
      }
    } else {
      media = [c.post_id as string];
    }

    const candidates: Array<{ comment: ZernioComment; mediaId: string }> = [];
    for (const mediaId of media) {
      if (!hasTime()) break;
      for (const cm of await commentsOf(mediaId)) {
        const t = cm.createdAt ? Date.parse(cm.createdAt) : NaN;
        if (Number.isNaN(t) || t < minTime) continue;
        if (!cm.fromId || (own && cm.fromId === own)) continue;
        if (own && cm.replyFromIds.includes(own)) continue;
        if (!campaignMatchesText(c, cm.text).matched) continue;
        candidates.push({ comment: cm, mediaId });
      }
    }
    if (candidates.length === 0) continue;

    const ids = candidates.map((x) => x.comment.id);
    const handled = await handledIds(sb, c, ids);
    const queued = await queuedCommentIds(sb, ids);
    const fresh = candidates
      .filter((x) => !handled.has(x.comment.id) && !queued.has(x.comment.id) && !queuedThisRun.has(x.comment.id))
      .sort((a, b) => Date.parse(a.comment.createdAt as string) - Date.parse(b.comment.createdAt as string))
      .slice(0, MAX_PER_CAMPAIGN);

    for (const x of fresh) {
      const payload: CommentPayload = {
        commentId: x.comment.id,
        mediaId: x.mediaId,
        text: x.comment.text,
        from: x.comment.fromId as string,
        username: x.comment.username,
        source: "polling",
      };
      await enqueueJob(sb, "comment", { ...payload }, null);
      queuedThisRun.add(x.comment.id);
      total++;
    }
  }
  return total;
}

async function handledIds(sb: Sb, c: Campaign, ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb
      .from("ig_dm_logs")
      .select("trigger_ref, status, attempts, public_status")
      .eq("campaign_id", c.id)
      .in("trigger_ref", ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<{
      trigger_ref: string;
      status: "pending" | "sent" | "failed" | "skipped_dedup" | "skipped_rate_limit" | "unconfirmed";
      attempts: number;
      public_status: "sent" | "failed" | "unconfirmed" | null;
    }>) {
      if (logHandled(c, row)) out.add(row.trigger_ref);
    }
  }
  return out;
}

/** Comentários que já têm job `comment` na fila (evita enfileirar de novo). */
async function queuedCommentIds(sb: Sb, ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb
      .from("ig_jobs")
      .select("payload")
      .eq("kind", "comment")
      .in("status", ["queued", "running"])
      .in("payload->>commentId", ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<{ payload: { commentId?: string } }>) {
      if (row.payload?.commentId) out.add(row.payload.commentId);
    }
  }
  return out;
}

/** 1x por dia: histórico de seguidores + seguidores atuais. */
async function dailyFollowers(sb: Sb, accountId: string): Promise<boolean> {
  const { data, error } = await sb
    .from("ig_follower_history")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const last = (data ?? [])[0] as { updated_at: string } | undefined;
  if (last && Date.now() - Date.parse(last.updated_at) < DAY_MS) return false;

  const now = new Date().toISOString();
  try {
    const hist = await followerHistory(accountId, 90);
    if (hist.length > 0) {
      const rows = hist.map((h) => ({ day: h.date, followers: Math.round(h.value), updated_at: now }));
      const { error: hErr } = await sb.from("ig_follower_history").upsert(rows, { onConflict: "day" });
      if (hErr) console.error("ig_follower_history:", hErr.message);
    }
  } catch (e) {
    console.warn("followerHistory:", errMsg(e));
  }
  try {
    const info = await accountInfo(accountId);
    if (info && typeof info.followersCount === "number") {
      const { error: zErr } = await sb.from("ig_zernio").update({ followers_count: info.followersCount }).eq("id", 1);
      if (zErr) console.error("ig_zernio followers:", zErr.message);
      // o valor observado hoje vale mais que o da série
      const { error: tErr } = await sb
        .from("ig_follower_history")
        .upsert({ day: now.slice(0, 10), followers: info.followersCount, updated_at: now }, { onConflict: "day" });
      if (tErr) console.error("ig_follower_history (hoje):", tErr.message);
    }
  } catch (e) {
    console.warn("accountInfo:", errMsg(e));
  }
  return true;
}

async function cleanup(sb: Sb): Promise<void> {
  const ev = new Date(Date.now() - 30 * DAY_MS).toISOString();
  const jb = new Date(Date.now() - 14 * DAY_MS).toISOString();
  const r1 = await sb.from("ig_webhook_events").delete().lt("created_at", ev);
  if (r1.error) console.error("cleanup ig_webhook_events:", r1.error.message);
  const r2 = await sb.from("ig_jobs").delete().in("status", ["done", "failed", "dead"]).lt("created_at", jb);
  if (r2.error) console.error("cleanup ig_jobs:", r2.error.message);
  const r3 = await sb.from("ig_rate").delete().lt("hour", new Date(Date.now() - DAY_MS).toISOString());
  if (r3.error) console.error("cleanup ig_rate:", r3.error.message);
}

async function maintenance(sb: Sb, state: ZernioState, deadline: number): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const hasTime = () => Date.now() < deadline;
  const accountId = state.account_id as string;
  let postsPromise: Promise<ZernioPost[]> | null = null;
  const posts = () => (postsPromise ??= listPosts(accountId));

  try {
    await bindNextReels(sb, accountId, posts);
  } catch (e) {
    console.warn("next_reel:", errMsg(e));
  }
  if (hasTime()) {
    try {
      out.reconciled = await reconcile(sb, state, posts, hasTime);
    } catch (e) {
      console.warn("reconcile:", errMsg(e));
    }
  }
  if (hasTime()) {
    try {
      if (await dailyFollowers(sb, accountId)) {
        out.followers = true;
        await cleanup(sb);
      }
    } catch (e) {
      console.warn("daily:", errMsg(e));
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------
// Handler
// ------------------------------------------------------------------------------------------

Deno.serve(async () => {
  const started = Date.now();
  const deadline = started + LOOP_MS;
  const sb = serviceClient();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

  let state: ZernioState | null;
  try {
    state = await loadState(sb);
  } catch (e) {
    console.error("ig-campaign-worker:", errMsg(e));
    return new Response(JSON.stringify({ error: "estado indisponível" }), { status: 500 });
  }

  await recoverStale(sb);

  let processed = 0;
  let maint: Record<string, unknown> | null = null;
  if (state) {
    while (deadline - Date.now() >= JOB_MIN_LEFT_MS) {
      const n = await processBatch(sb, state, supabaseUrl, deadline);
      processed += n;
      if (n === CLAIM_LIMIT) continue; // ainda pode haver mais na fila

      if (maint === null && state.account_id && deadline - Date.now() >= MAINT_MIN_LEFT_MS) {
        if (await claimMaintenance(sb)) {
          maint = await maintenance(sb, state, deadline);
          continue;
        }
        maint = {}; // outra execução já fez (ou ainda não deu 5 min)
      }
      if (Date.now() + SLEEP_MS >= deadline) break;
      await sleep(SLEEP_MS);
    }
  }

  const { error } = await sb.from("ig_zernio").update({ last_worker_at: new Date().toISOString() }).eq("id", 1);
  if (error) console.error("last_worker_at:", error.message);

  return new Response(JSON.stringify({ ok: true, processed, maintenance: maint, ms: Date.now() - started }), {
    headers: { "Content-Type": "application/json" },
  });
});
