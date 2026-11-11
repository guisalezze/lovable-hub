import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Redirecionador público de links rastreados do Instagram: GET ?s=<slug>&u=<igsid>
// Grava o clique em ig_link_clicks e responde 302 para a URL do botão. Sem JWT (verify_jwt = false).
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const NOT_FOUND = () =>
  new Response("Link não encontrado", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });

// prévias de link (WhatsApp, Meta, etc.) e robôs não contam como clique; continuam sendo redirecionados
const BOT_UA = /facebookexternalhit|facebot|meta-externalagent|whatsapp|telegrambot|slackbot|twitterbot|linkedinbot|discordbot|bot|crawler|spider/i;

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const q = new URL(req.url).searchParams;
  const slug = (q.get("s") ?? "").trim();
  if (!/^[0-9A-Za-z]{1,32}$/.test(slug)) return NOT_FOUND();

  const { data: link } = await supabase.from("ig_links").select("id, url").eq("slug", slug).maybeSingle();
  if (!link?.url) return NOT_FOUND();

  // só redireciona para http(s)
  let target: URL;
  try {
    target = new URL(String(link.url));
  } catch {
    return NOT_FOUND();
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") return NOT_FOUND();

  // o clique nunca bloqueia o redirecionamento: erro na gravação só vai para o log (HEAD não conta)
  if (req.method === "GET" && !BOT_UA.test(req.headers.get("user-agent") ?? "")) {
    try {
      const u = (q.get("u") ?? "").trim();
      const { error } = await supabase
        .from("ig_link_clicks")
        .insert({ link_id: link.id, ig_user_id: /^\d{1,32}$/.test(u) ? u : null });
      if (error) console.error("ig_link_clicks:", error.message);
    } catch (e) {
      console.error("ig_link_clicks:", e instanceof Error ? e.message : String(e));
    }
  }

  return new Response(null, {
    status: 302,
    headers: { Location: target.toString(), "Cache-Control": "no-store" },
  });
});
