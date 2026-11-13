import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Relatório público de uma campanha do Instagram: GET ?slug=<share_slug>
// Só agregados (envios por dia, cliques por link). Nada de contatos, ids de pessoas ou URLs completas.
// Sem JWT (verify_jwt = false); lê com service_role via ig_campaign_report.
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": status === 200 ? "public, max-age=60" : "no-store",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);

  const slug = (new URL(req.url).searchParams.get("slug") ?? "").trim();
  if (!/^[0-9A-Za-z]{8,64}$/.test(slug)) return json({ error: "not found" }, 404);

  const { data, error } = await supabase.rpc("ig_campaign_report", { p_slug: slug });
  if (error) {
    console.error("ig_campaign_report:", error.message);
    return json({ error: "internal error" }, 500);
  }
  if (data === null || data === undefined) return json({ error: "not found" }, 404);
  return json(data);
});
