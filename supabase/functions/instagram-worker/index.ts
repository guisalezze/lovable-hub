import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const IG_API = "https://graph.instagram.com/v25.0";

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: config } = await supabase.from("ig_config").select("*").limit(1).single();
  if (!config?.access_token) return new Response("No config", { status: 200 });

  const igUserId: string = config.instagram_user_id;
  const token: string = config.access_token;
  const now = new Date().toISOString();

  const { data: items } = await supabase
    .from("ig_queue")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_at", now)
    .is("claimed_at", null)
    .order("created_at", { ascending: true })
    .limit(10);

  if (!items?.length) return new Response("Empty", { status: 200 });

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

  return new Response("Done", { status: 200 });
});
