// Webhook do Zernio (público, verify_jwt = false).
// Spec: docs/superpowers/specs/2026-11-13-instagram-campanhas-zernio-design.md (seção 4).
//
// 1. Lê o corpo cru e confere X-Zernio-Signature (HMAC-SHA256 hex, tempo constante) -> 401.
// 2. Evento de teste -> 200. Outra conta / evento não usado -> 200 (ignorado).
// 3. Dedupe por X-Zernio-Event-Id em ig_webhook_events (conflito -> 200 "duplicado").
// 4. Enfileira o job em ig_jobs (dedupe_key por comentário/mensagem/toque) e responde 200.
//    Falha ao gravar -> 500 (o Zernio reenvia).

import { verifySignature } from "../_shared/zernio.ts";
import { enqueueJob, jobForEvent, loadState, normalizeEvent, serviceClient } from "../_shared/engine.ts";

const MAX_BODY = 1_000_000;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "Método não permitido" });

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return json(400, { error: "Corpo inválido" });
  }
  if (raw.length > MAX_BODY) return json(413, { error: "Corpo grande demais" });

  const sb = serviceClient();
  let state;
  try {
    state = await loadState(sb);
  } catch (e) {
    console.error("zernio-webhook: estado:", e instanceof Error ? e.message : String(e));
    return json(500, { error: "Falha ao ler a configuração" });
  }

  const secret = state?.webhook_secret ?? "";
  const signature = req.headers.get("x-zernio-signature") ?? req.headers.get("x-late-signature");
  if (!secret || !(await verifySignature(secret, raw, signature))) {
    return json(401, { error: "Assinatura inválida" });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: "JSON inválido" });
  }
  if (body && typeof body === "object" && (body as Record<string, unknown>).test === true) {
    return json(200, { ok: true, test: true });
  }

  const norm = normalizeEvent(body, { account_id: state?.account_id ?? null, ig_user_id: state?.ig_user_id ?? null });
  if ("ignored" in norm) return json(200, { ok: true, ignored: norm.ignored });
  const ev = norm.ev;

  const b = body as Record<string, unknown>;
  const eventId =
    req.headers.get("x-zernio-event-id") ??
    req.headers.get("x-late-event-id") ??
    (typeof b.id === "string" && b.id ? b.id : null);
  const eventName =
    req.headers.get("x-zernio-event") ?? (typeof b.event === "string" ? b.event : null);

  // Dedupe do evento (mesmo id em todas as reentregas).
  let eventRowId: string | null = null;
  if (eventId) {
    const { data, error } = await sb
      .from("ig_webhook_events")
      .insert({ event_id: eventId, event: eventName, payload: body })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") return json(200, { ok: true, duplicate: true, message: "duplicado" });
      console.error("zernio-webhook: ig_webhook_events:", error.message);
      return json(500, { error: "Falha ao gravar o evento" });
    }
    eventRowId = (data as { id: string }).id;
  }

  try {
    const job = jobForEvent(ev);
    if (ev.type === "read") {
      // no máximo 1 job de leitura por pessoa por minuto
      const since = new Date(Date.now() - 60_000).toISOString();
      const { data, error } = await sb
        .from("ig_jobs")
        .select("id")
        .eq("kind", "read")
        .eq("payload->>from", ev.from)
        .gte("created_at", since)
        .limit(1);
      if (error) throw new Error(error.message);
      if ((data ?? []).length > 0) return json(200, { ok: true, skipped: "leitura recente" });
    }
    const created = await enqueueJob(sb, job.kind, job.payload, job.dedupe_key);
    return json(200, { ok: true, queued: created, kind: job.kind });
  } catch (e) {
    console.error("zernio-webhook: ig_jobs:", e instanceof Error ? e.message : String(e));
    // Desfaz o registro do evento para a reentrega do Zernio não cair no "duplicado".
    if (eventRowId) await sb.from("ig_webhook_events").delete().eq("id", eventRowId);
    return json(500, { error: "Falha ao enfileirar" });
  }
});
