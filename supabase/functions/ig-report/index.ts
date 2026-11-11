import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Relatório público de uma regra do Instagram: GET ?slug=<share_slug>
// Só agregados (respostas por dia, cliques por botão). Nada de contatos, ids de pessoas ou URLs completas.
// Sem JWT (verify_jwt = false); lê com service_role.
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const DAYS = 30;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=60" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);

  const slug = (new URL(req.url).searchParams.get("slug") ?? "").trim();
  if (!/^[0-9A-Za-z]{8,64}$/.test(slug)) return json({ error: "not found" }, 404);

  const { data: rule } = await supabase
    .from("ig_automations")
    .select("id, name, trigger")
    .eq("share_slug", slug)
    .maybeSingle();
  if (!rule) return json({ error: "not found" }, 404);

  // dias e cliques agregados no banco (funções ig_report_daily / ig_report_clicks, só service_role)
  const [daily, clk] = await Promise.all([
    supabase.rpc("ig_report_daily", { p_rule: rule.id, p_days: DAYS }),
    supabase.rpc("ig_report_clicks", { p_rule: rule.id }),
  ]);
  if (daily.error || clk.error) return json({ error: "internal error" }, 500);

  const days = ((daily.data ?? []) as { day: string; sent: number; failed: number; skipped: number }[]).map((d) => ({
    day: String(d.day),
    sent: Number(d.sent),
    failed: Number(d.failed),
    skipped: Number(d.skipped),
  }));
  const totals = days.reduce(
    (t, d) => ({ sent: t.sent + d.sent, failed: t.failed + d.failed, skipped: t.skipped + d.skipped }),
    { sent: 0, failed: 0, skipped: 0 },
  );

  // cliques por botão (host da URL apenas); links do mesmo botão e host somam
  const merged = new Map<string, { node_id: string; button_index: number; url_host: string; clicks: number }>();
  for (const l of (clk.data ?? []) as { node_id: string | null; button_index: number | null; url: string | null; clicks: number }[]) {
    let host = "";
    try {
      host = new URL(String(l.url)).host;
    } catch {
      // URL inválida: sem host
    }
    const row = { node_id: String(l.node_id ?? ""), button_index: Number(l.button_index ?? 0), url_host: host, clicks: Number(l.clicks) };
    const k = `${row.node_id}|${row.button_index}|${row.url_host}`;
    const cur = merged.get(k);
    if (cur) cur.clicks += row.clicks;
    else merged.set(k, row);
  }
  const clicks = [...merged.values()].sort((x, y) => y.clicks - x.clicks);

  return json({ name: rule.name, trigger: rule.trigger, days, totals, clicks });
});
