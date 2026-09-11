const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

async function resolveAttribution(adminClient: any, payload: any) {
  const findAttr = (key: string) =>
    payload[key] || payload.note_attributes?.find((n: any) => n.name === key)?.value || null;

  const utm_campaign = findAttr("utm_campaign");
  const utm_medium = findAttr("utm_medium");
  const utm_content = findAttr("utm_content");
  let fbclid = findAttr("fbclid");
  let fbp = findAttr("fbp");
  let fbc = findAttr("fbc");

  let campaign = splitNameId(utm_campaign);
  let adset = splitNameId(utm_medium);
  let ad = splitNameId(utm_content);

  const rtVid = findAttr("rt_vid");
  if ((!ad.id || !fbclid) && rtVid) {
    const { data: visit } = await adminClient
      .from("ad_visits").select("*").eq("rt_vid", rtVid)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (visit) {
      campaign = campaign.id ? campaign : { name: visit.campaign_name, id: visit.campaign_id };
      adset = adset.id ? adset : { name: visit.adset_name, id: visit.adset_id };
      ad = ad.id ? ad : { name: visit.ad_name, id: visit.ad_id };
      fbclid = fbclid || visit.fbclid;
      fbp = fbp || visit.fbp;
      fbc = fbc || visit.fbc;
    }
  }

  return { fbclid, fbp, fbc, campaign_id: campaign.id, adset_id: adset.id, ad_id: ad.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Verify CartPanda secret — mandatory
  const webhookSecret = Deno.env.get("CARTPANDA_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("CARTPANDA_WEBHOOK_SECRET not configured");
    return new Response(JSON.stringify({ error: "Webhook not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const providedToken = req.headers.get("X-Cartpanda-Token") || req.headers.get("Authorization")?.replace("Bearer ", "");
  if (providedToken !== webhookSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const payload = await req.json();
    
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get nutra project
    const { data: nutraProject } = await adminClient
      .from("projects")
      .select("id")
      .eq("slug", "nutra")
      .single();

    if (!nutraProject) {
      return new Response(JSON.stringify({ error: "Nutra project not found" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cartpanda S2S payload mapping
    const attribution = await resolveAttribution(adminClient, payload);
    const sale = {
      project_id: nutraProject.id,
      source: "cartpanda",
      order_id: payload.order_id || payload.id?.toString(),
      customer_name: payload.customer?.name || payload.billing_address?.name,
      customer_email: payload.customer?.email || payload.email,
      customer_phone: payload.customer?.phone || payload.phone,
      product_name: payload.line_items?.[0]?.title || payload.product_name,
      product_id: payload.line_items?.[0]?.product_id?.toString(),
      amount: Number(payload.total_price || payload.amount || 0),
      currency: payload.currency || "BRL",
      status: mapCartpandaStatus(payload.financial_status || payload.status),
      payment_method: payload.payment_method || payload.gateway,
      tracking_code: payload.fulfillments?.[0]?.tracking_number,
      utm_source: payload.utm_source || payload.note_attributes?.find((n: any) => n.name === "utm_source")?.value,
      utm_medium: payload.utm_medium || payload.note_attributes?.find((n: any) => n.name === "utm_medium")?.value,
      utm_campaign: payload.utm_campaign || payload.note_attributes?.find((n: any) => n.name === "utm_campaign")?.value,
      fbclid: attribution.fbclid,
      fbp: attribution.fbp,
      fbc: attribution.fbc,
      campaign_id: attribution.campaign_id,
      adset_id: attribution.adset_id,
      ad_id: attribution.ad_id,
      raw_payload: payload,
    };

    // Upsert by order_id
    if (sale.order_id) {
      const { data: existing } = await adminClient
        .from("nutra_sales")
        .select("id")
        .eq("source", "cartpanda")
        .eq("order_id", sale.order_id)
        .maybeSingle();

      if (existing) {
        await adminClient.from("nutra_sales").update(sale).eq("id", existing.id);
      } else {
        await adminClient.from("nutra_sales").insert(sale);
      }
    } else {
      await adminClient.from("nutra_sales").insert(sale);
    }

    if (sale.status === "approved") {
      fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/meta-capi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: "nutra",
          event_name: "Purchase",
          order_id: sale.order_id || `cartpanda-${Date.now()}`,
          value: sale.amount,
          currency: sale.currency,
          email: sale.customer_email,
          fbp: sale.fbp,
          fbc: sale.fbc,
        }),
      }).catch((err) => console.error("meta-capi call failed:", err));
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function mapCartpandaStatus(status: string): string {
  const map: Record<string, string> = {
    paid: "approved",
    pending: "pending",
    refunded: "refunded",
    cancelled: "canceled",
    authorized: "pending",
    partially_paid: "pending",
  };
  return map[status?.toLowerCase()] || status || "pending";
}
