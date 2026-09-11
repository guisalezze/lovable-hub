const EDUCACIONAL_ORIGIN_RE = /^https:\/\/([a-z0-9-]+\.)*guisalezze\.com$/i;

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (EDUCACIONAL_ORIGIN_RE.test(origin)) return true;
  const nutraAllowlist = (Deno.env.get("NUTRA_LP_ORIGINS") || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  return nutraAllowlist.includes(origin);
}

function corsHeadersFor(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin! : "https://crm.guisalezze.com",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// "Campanha Frio 01|120210987654320123" -> { name: "Campanha Frio 01", id: "120210987654320123" }
const ID_RE = /^\d{6,}$/;
function splitNameId(value?: string | null): { name: string | null; id: string | null } {
  if (!value) return { name: null, id: null };
  const raw = decodeURIComponent(String(value).replace(/\+/g, " ")).trim();
  if (!raw) return { name: null, id: null };
  const cut = raw.lastIndexOf("|");
  if (cut === -1) return ID_RE.test(raw) ? { name: null, id: raw } : { name: raw, id: null };
  const name = raw.slice(0, cut).trim() || null;
  const tail = raw.slice(cut + 1).trim();
  return { name, id: ID_RE.test(tail) ? tail : null };
}

interface CollectPayload {
  rt_vid: string;
  project: "educacional" | "nutra";
  utm_source?: string; utm_medium?: string; utm_campaign?: string;
  utm_content?: string; utm_term?: string;
  fbclid?: string; fbp?: string; fbc?: string;
  landing_url?: string; referrer?: string;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = corsHeadersFor(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!isAllowedOrigin(origin)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: CollectPayload;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.rt_vid || !body.project || !["educacional", "nutra"].includes(body.project)) {
    return new Response(JSON.stringify({ error: "rt_vid and project are required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const campaign = splitNameId(body.utm_campaign);
  const adset = splitNameId(body.utm_medium);
  const ad = splitNameId(body.utm_content);

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { error } = await adminClient.from("ad_visits").insert({
    rt_vid: body.rt_vid,
    project: body.project,
    utm_source: body.utm_source ?? null,
    utm_medium: body.utm_medium ?? null,
    utm_campaign: body.utm_campaign ?? null,
    utm_content: body.utm_content ?? null,
    utm_term: body.utm_term ?? null,
    fbclid: body.fbclid ?? null,
    fbp: body.fbp ?? null,
    fbc: body.fbc ?? null,
    campaign_id: campaign.id,
    adset_id: adset.id,
    ad_id: ad.id,
    campaign_name: campaign.name,
    adset_name: adset.name,
    ad_name: ad.name,
    landing_url: body.landing_url ?? null,
    referrer: body.referrer ?? null,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    user_agent: req.headers.get("user-agent") ?? null,
  });

  if (error) {
    console.error("ad-collect insert error:", error);
    return new Response(JSON.stringify({ error: "Failed to record visit" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
