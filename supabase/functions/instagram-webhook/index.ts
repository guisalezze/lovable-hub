import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERIFY_TOKEN = Deno.env.get("IG_WEBHOOK_VERIFY_TOKEN")!;
const APP_SECRET = Deno.env.get("IG_APP_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

function matches(text: string, keywords: string[], matchType: string): boolean {
  const lower = (text ?? "").toLowerCase().trim();
  if (matchType === "any") return true;
  if (matchType === "exact") return keywords.some((k) => lower === k.toLowerCase().trim());
  return keywords.some((k) => lower.includes(k.toLowerCase().trim()));
}

function buildWelcomePayload(auto: Record<string, unknown>, recipientId: string, commentId?: string) {
  const recipient = commentId ? { comment_id: commentId } : { id: recipientId };
  const text = (auto.welcome_dm as string) ?? "Oi! Obrigado por comentar 😊";
  if (auto.quick_reply_label) {
    return {
      recipient,
      message: {
        text,
        quick_replies: [{ content_type: "text", title: auto.quick_reply_label as string, payload: "QR_REPLY" }],
      },
    };
  }
  return { recipient, message: { text } };
}

async function processComment(
  supabase: ReturnType<typeof createClient>,
  igAccountId: string,
  comment: Record<string, unknown>
) {
  const commentId = comment.id as string;
  const commentText = (comment.text as string) ?? "";
  const senderId = (comment.from as Record<string, string>)?.id;
  const senderUsername = (comment.from as Record<string, string>)?.username;
  if (!senderId || !commentId) return;

  const { data: automations } = await supabase.from("ig_automations").select("*").eq("active", true);
  if (!automations?.length) return;

  for (const auto of automations) {
    if (!(auto.triggers as string[]).includes("comment")) continue;
    if (!matches(commentText, (auto.keywords as string[]) ?? [], auto.match_type ?? "contains")) continue;
    if (auto.post_id && auto.post_id !== (comment.media as Record<string, string>)?.id) continue;

    const { data: contact } = await supabase
      .from("ig_contacts")
      .upsert(
        { instagram_user_id: senderId, username: senderUsername, last_automation_id: auto.id },
        { onConflict: "instagram_user_id" }
      )
      .select()
      .single();

    if (auto.welcome_dm) {
      await supabase.from("ig_queue").insert({
        automation_id: auto.id,
        contact_id: contact?.id,
        recipient_ig_user_id: igAccountId,
        recipient_comment_id: commentId,
        message_type: "welcome_dm",
        message_body: buildWelcomePayload(auto, senderId, commentId),
        scheduled_at: new Date().toISOString(),
      });
    }

    if ((auto.public_replies as string[])?.length) {
      const replies = auto.public_replies as string[];
      const variation = replies[Math.floor(Math.random() * replies.length)];
      await supabase.from("ig_queue").insert({
        automation_id: auto.id,
        contact_id: contact?.id,
        recipient_ig_user_id: igAccountId,
        recipient_comment_id: commentId,
        message_type: "public_reply",
        message_body: { comment_id: commentId, message: variation },
        scheduled_at: new Date().toISOString(),
      });
    }

    break; // primeira automação que casar ganha
  }
}

async function processMessage(
  supabase: ReturnType<typeof createClient>,
  igAccountId: string,
  messaging: Record<string, unknown>
) {
  const senderId = (messaging.sender as Record<string, string>)?.id;
  if (!senderId || senderId === igAccountId) return;

  const msg = messaging.message as Record<string, unknown>;
  const text = (msg?.text as string) ?? "";
  const isStoryReply = !!(msg?.reply_to as Record<string, unknown>)?.story;
  const isQuickReply = !!msg?.quick_reply;

  // Botão de resposta rápida tocado → abre janela de 24h + enfileira follow-ups
  if (isQuickReply) {
    await supabase
      .from("ig_contacts")
      .update({ last_reply_at: new Date().toISOString() })
      .eq("instagram_user_id", senderId);

    const { data: contact } = await supabase
      .from("ig_contacts")
      .select("*")
      .eq("instagram_user_id", senderId)
      .single();

    if (!contact?.last_automation_id) return;

    const { data: auto } = await supabase
      .from("ig_automations")
      .select("*")
      .eq("id", contact.last_automation_id)
      .single();

    if (!auto) return;

    if (auto.link_url) {
      await supabase.from("ig_queue").insert({
        automation_id: auto.id,
        contact_id: contact.id,
        recipient_ig_user_id: igAccountId,
        message_type: "link",
        message_body: {
          recipient: { id: senderId },
          message: {
            attachment: {
              type: "template",
              payload: {
                template_type: "button",
                text: auto.link_text ?? "Aqui está o link!",
                buttons: [{ type: "web_url", url: auto.link_url, title: auto.link_button_label ?? "Acessar" }],
              },
            },
          },
        },
        scheduled_at: new Date().toISOString(),
      });
    }

    if (auto.reminder_text) {
      const reminderAt = new Date();
      reminderAt.setMinutes(reminderAt.getMinutes() + (auto.reminder_delay_minutes ?? 60));
      await supabase.from("ig_queue").insert({
        automation_id: auto.id,
        contact_id: contact.id,
        recipient_ig_user_id: igAccountId,
        message_type: "reminder",
        message_body: { recipient: { id: senderId }, message: { text: auto.reminder_text } },
        scheduled_at: reminderAt.toISOString(),
      });
    }
    return;
  }

  const triggerType = isStoryReply ? "story_reply" : "dm";
  const { data: automations } = await supabase.from("ig_automations").select("*").eq("active", true);
  if (!automations?.length) return;

  for (const auto of automations) {
    if (!(auto.triggers as string[]).includes(triggerType)) continue;
    if (!matches(text, (auto.keywords as string[]) ?? [], auto.match_type ?? "contains")) continue;

    const { data: contact } = await supabase
      .from("ig_contacts")
      .upsert(
        { instagram_user_id: senderId, last_automation_id: auto.id },
        { onConflict: "instagram_user_id" }
      )
      .select()
      .single();

    if (auto.welcome_dm) {
      await supabase.from("ig_queue").insert({
        automation_id: auto.id,
        contact_id: contact?.id,
        recipient_ig_user_id: igAccountId,
        message_type: "welcome_dm",
        message_body: buildWelcomePayload(auto, senderId),
        scheduled_at: new Date().toISOString(),
      });
    }
    break;
  }
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

  const body = JSON.parse(rawBody);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  await supabase.from("ig_events").insert({ payload: body, processed: false });

  for (const entry of body.entry ?? []) {
    const igAccountId: string = entry.id;
    for (const change of entry.changes ?? []) {
      if (change.field === "comments") await processComment(supabase, igAccountId, change.value);
    }
    for (const messaging of entry.messaging ?? []) {
      await processMessage(supabase, igAccountId, messaging);
    }
  }

  // Dispara o worker sem aguardar para responder rápido à Meta
  fetch(`${SUPABASE_URL}/functions/v1/instagram-worker`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
  }).catch(() => {});

  return new Response("OK", { status: 200 });
});
