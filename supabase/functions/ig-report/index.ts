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
const PAGE = 1000;
const MAX_PAGES = 20;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=60" },
  });
}

// Dia (YYYY-MM-DD) em America/Sao_Paulo
function saoPauloDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);

  const slug = (new URL(req.url).searchParams.get("slug") ?? "").trim();
  if (!/^[0-9A-Za-z_-]{1,64}$/.test(slug)) return json({ error: "not found" }, 404);

  const { data: rule } = await supabase
    .from("ig_automations")
    .select("id, name, trigger")
    .eq("share_slug", slug)
    .maybeSingle();
  if (!rule) return json({ error: "not found" }, 404);

  // últimos 30 dias (hoje incluído), do mais antigo ao mais novo; dias sem resposta ficam zerados
  const now = Date.now();
  const dayList: string[] = [];
  for (let i = DAYS - 1; i >= 0; i--) dayList.push(saoPauloDay(new Date(now - i * 86400e3)));
  const perDay = new Map(dayList.map((d) => [d, { day: d, sent: 0, failed: 0, skipped: 0 }]));

  // folga de 2 dias no corte (UTC x São Paulo); o que sobra é descartado pelo mapa de dias
  const since = new Date(now - (DAYS + 2) * 86400e3).toISOString();
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from("ig_replies")
      .select("created_at, status")
      .eq("rule_id", rule.id)
      .neq("kind", "postback") // cliques em botão não são respostas disparadas
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return json({ error: "internal error" }, 500);
    for (const r of data ?? []) {
      const bucket = perDay.get(saoPauloDay(new Date(r.created_at)));
      if (!bucket) continue;
      if (r.status === "sent") bucket.sent++;
      else if (r.status === "failed") bucket.failed++;
      else if (r.status === "skipped") bucket.skipped++;
    }
    if ((data?.length ?? 0) < PAGE) break;
  }
  const days = dayList.map((d) => perDay.get(d)!);
  const totals = days.reduce(
    (t, d) => ({ sent: t.sent + d.sent, failed: t.failed + d.failed, skipped: t.skipped + d.skipped }),
    { sent: 0, failed: 0, skipped: 0 },
  );

  // cliques por botão (host da URL apenas); links do mesmo botão e host somam
  const { data: links } = await supabase
    .from("ig_links")
    .select("id, node_id, button_index, url")
    .eq("rule_id", rule.id);
  const counted = await Promise.all(
    (links ?? []).map(async (l) => {
      const { count } = await supabase
        .from("ig_link_clicks")
        .select("id", { count: "exact", head: true })
        .eq("link_id", l.id);
      let host = "";
      try {
        host = new URL(String(l.url)).host;
      } catch {
        // URL inválida: sem host
      }
      return { node_id: String(l.node_id ?? ""), button_index: Number(l.button_index ?? 0), url_host: host, clicks: count ?? 0 };
    }),
  );
  const merged = new Map<string, { node_id: string; button_index: number; url_host: string; clicks: number }>();
  for (const c of counted) {
    const k = `${c.node_id}|${c.button_index}|${c.url_host}`;
    const cur = merged.get(k);
    if (cur) cur.clicks += c.clicks;
    else merged.set(k, c);
  }
  const clicks = [...merged.values()].sort((a, b) => b.clicks - a.clicks);

  return json({ name: rule.name, trigger: rule.trigger, days, totals, clicks });
});
