import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Supports both VAPID_PUBLIC_KEY (Supabase Secret) and VITE_VAPID_PUBLIC_KEY (legacy)
const VAPID_PUBLIC_KEY =
  Deno.env.get("VAPID_PUBLIC_KEY") || Deno.env.get("VITE_VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_SUBJECT = "mailto:support@solaryz.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://crm.guisalezze.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ─── Utilities ───────────────────────────────────────────────────────────────

function b64urlToBytes(b64url: string): Uint8Array {
  const padding = "=".repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  return new Uint8Array(bin.length).map((_, i) => bin.charCodeAt(i));
}

function bytesToB64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

// ─── HMAC-SHA-256 ────────────────────────────────────────────────────────────

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

// ─── VAPID JWT (ES256) ────────────────────────────────────────────────────────

async function importVapidPrivateKey(rawB64url: string): Promise<CryptoKey> {
  const raw = b64urlToBytes(rawB64url);
  // Wrap 32-byte raw P-256 key in minimal PKCS#8 shell
  const header = Uint8Array.from([
    0x30, 0x41, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06,
    0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03,
    0x01, 0x07, 0x04, 0x27, 0x30, 0x25, 0x02, 0x01,
    0x01, 0x04, 0x20,
  ]);
  const pkcs8 = new Uint8Array(header.length + raw.length);
  pkcs8.set(header);
  pkcs8.set(raw, header.length);
  return await crypto.subtle.importKey(
    "pkcs8",
    pkcs8.buffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

async function createVapidJwt(audience: string): Promise<string> {
  const privateKey = await importVapidPrivateKey(VAPID_PRIVATE_KEY);
  const now = Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();

  const headerB64 = bytesToB64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claimsB64 = bytesToB64url(
    enc.encode(JSON.stringify({ aud: audience, exp: now + 43200, sub: VAPID_SUBJECT }))
  );
  const sigInput = `${headerB64}.${claimsB64}`;

  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    enc.encode(sigInput)
  );
  return `${sigInput}.${bytesToB64url(new Uint8Array(sig))}`;
}

// ─── Web Push Payload Encryption (RFC 8291 / aes128gcm) ──────────────────────
// Compatível com Apple (iOS PWA), Chrome e Firefox.

async function encryptPayload(
  plaintext: string,
  p256dhB64url: string,
  authB64url: string
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Ephemeral server key pair
  const serverKP = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]
  );
  const serverPubKey = new Uint8Array(await crypto.subtle.exportKey("raw", serverKP.publicKey));

  // Import client's public key
  const clientPubBytes = b64urlToBytes(p256dhB64url);
  const clientPubKey = await crypto.subtle.importKey(
    "raw", clientPubBytes, { name: "ECDH", namedCurve: "P-256" }, false, []
  );

  // ECDH shared secret
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: clientPubKey }, serverKP.privateKey, 256)
  );

  const authBytes = b64urlToBytes(authB64url);

  // RFC 8291 key derivation via HMAC-SHA-256:
  // PRK_key = HMAC(auth_secret, ecdh_secret)
  const prkKey = await hmac(authBytes, ecdhSecret);

  // key_info = "WebPush: info\0" || ua_public || as_public
  const keyInfo = concat(enc.encode("WebPush: info\0"), clientPubBytes, serverPubKey);

  // IKM = HMAC(PRK_key, key_info || 0x01)
  const ikm = await hmac(prkKey, concat(keyInfo, new Uint8Array([0x01])));

  // PRK = HMAC(salt, IKM)
  const prk = await hmac(salt, ikm);

  // CEK = HMAC(PRK, "Content-Encoding: aes128gcm\0" || 0x01)[0:16]
  const cek = (await hmac(prk, concat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([0x01])))).slice(0, 16);

  // NONCE = HMAC(PRK, "Content-Encoding: nonce\0" || 0x01)[0:12]
  const nonce = (await hmac(prk, concat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([0x01])))).slice(0, 12);

  // Encrypt: plaintext || 0x02 (padding delimiter, last record)
  const paddedContent = concat(enc.encode(plaintext), new Uint8Array([0x02]));
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, paddedContent)
  );

  // Build RFC 8291 body: salt(16) || rs(4,be) || idlen(1) || server_pub(65) || ciphertext
  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1 + serverPubKey.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs, false);
  header[20] = serverPubKey.length; // 65
  header.set(serverPubKey, 21);

  return concat(header, ciphertext);
}

// ─── Core push sender ─────────────────────────────────────────────────────────

interface PushSub {
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
}

async function sendWebPush(
  sub: PushSub,
  payload: { title: string; body: string; icon?: string; tag?: string; data?: unknown }
): Promise<{ ok: boolean; status: number; detail: string }> {
  const url = new URL(sub.endpoint);
  const audience = `${url.protocol}//${url.host}`;

  const jwt = await createVapidJwt(audience);
  // RFC 8291 (aes128gcm) — compatível com Apple iOS PWA, Chrome e Firefox
  const encryptedBody = await encryptPayload(
    JSON.stringify(payload),
    sub.p256dh_key,
    sub.auth_key
  );

  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      // RFC 8292 VAPID format: "vapid t=<jwt>,k=<pubkey>"
      Authorization: `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: "86400",
    },
    body: encryptedBody,
  });

  const detail = await res.text();
  console.log(`[push] endpoint=${sub.endpoint.slice(0, 60)}... status=${res.status} body=${detail}`);
  return { ok: res.status === 201 || res.status === 200, status: res.status, detail };
}

// ─── Supabase client helper ────────────────────────────────────────────────────

function makeClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
}

// ─── HTTP handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // ── Diagnostics / quick test (GET) ──────────────────────────────────────────
  if (req.method === "GET") {
    const log: Record<string, unknown> = {};

    log.vapid_public_key = VAPID_PUBLIC_KEY ? `OK (${VAPID_PUBLIC_KEY.length} chars)` : "MISSING";
    log.vapid_private_key = VAPID_PRIVATE_KEY ? `OK (${VAPID_PRIVATE_KEY.length} chars)` : "MISSING";

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      log.diagnosis = "Configure VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY nos Secrets do Supabase.";
      return json({ ok: false, log }, 500);
    }

    const supabase = makeClient();
    const { data: sub, error: subErr } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh_key, auth_key, user_id")
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (subErr || !sub) {
      log.subscription = "Nenhuma subscription encontrada no banco.";
      return json({ ok: false, log });
    }

    log.subscription = `user_id=${sub.user_id} endpoint=${sub.endpoint.slice(0, 60)}...`;

    try {
      const result = await sendWebPush(sub, {
        title: "🔔 Teste de Push — Solaryz",
        body: "Se você recebeu isso, as notificações estão funcionando!",
        icon: "/logo.png",
        tag: `test-${Date.now()}`,
      });
      log.push_result = result;
      return json({ ok: result.ok, log });
    } catch (err: unknown) {
      log.push_error = err instanceof Error ? err.message : String(err);
      return json({ ok: false, log }, 500);
    }
  }

  // ── Send push (POST) ─────────────────────────────────────────────────────────
  if (req.method === "POST") {
    try {
      const { userId, title, body, icon, data, tag } = await req.json();

      if (!userId || !title || !body) {
        return json({ error: "userId, title e body são obrigatórios" }, 400);
      }

      if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
        return json({
          error: "VAPID keys não configuradas",
          details: "Configure VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY nos Secrets do Supabase.",
        }, 500);
      }

    const supabase = makeClient();
    const { data: subs, error: subErr } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh_key, auth_key")
      .eq("user_id", userId);

    if (subErr || !subs || subs.length === 0) {
      return json({ error: "Nenhuma subscription encontrada", details: subErr?.message }, 404);
    }

    const results: unknown[] = [];
    for (const sub of subs) {
      try {
        const result = await sendWebPush(sub, { title, body, icon, tag, data });
        results.push({ endpoint: sub.endpoint.slice(0, 40) + "...", ...result });

        // 410 Gone = subscription expirada; limpar este endpoint
        if (result.status === 410 || result.status === 404) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      } catch (pushErr: unknown) {
        results.push({ endpoint: sub.endpoint.slice(0, 40) + "...", error: pushErr instanceof Error ? pushErr.message : String(pushErr) });
      }
    }

    const anyOk = results.some((r: any) => r.ok);
    return json({ success: anyOk, sent_to: subs.length, results });
    } catch (err: unknown) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  }

  return json({ error: "Método não suportado" }, 405);
});
