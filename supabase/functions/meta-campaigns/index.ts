import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://crm.guisalezze.com",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const since = url.searchParams.get("since");
    const until = url.searchParams.get("until");

    if (!since || !until) {
      return new Response(JSON.stringify({ error: "Missing since/until params" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let accessToken = Deno.env.get("META_ADS_ACCESS_TOKEN");
    let accountId = Deno.env.get("META_ADS_ACCOUNT_ID");

    // Fallback: read from app_settings if env vars are empty
    if (!accessToken || !accountId) {
      const serviceClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: settings } = await serviceClient
        .from("app_settings")
        .select("key, value")
        .in("key", ["meta_ads_access_token", "meta_ads_account_id"]);

      for (const s of settings || []) {
        const val = typeof s.value === "string" ? s.value : JSON.stringify(s.value);
        const clean = val.replace(/^"|"$/g, "");
        if (s.key === "meta_ads_access_token" && clean) accessToken = clean;
        if (s.key === "meta_ads_account_id" && clean) accountId = clean;
      }
    }

    if (!accessToken || !accountId) {
      return new Response(JSON.stringify({ error: "Meta credentials not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const metaUrl = `https://graph.facebook.com/v21.0/act_${accountId}/insights?` +
      new URLSearchParams({
        access_token: accessToken,
        fields: "campaign_id,campaign_name,spend,clicks,impressions",
        time_range: JSON.stringify({ since, until }),
        level: "campaign",
        limit: "500",
        sort: "spend_descending",
      }).toString();

    const metaRes = await fetch(metaUrl);
    const metaData = await metaRes.json();

    if (metaData.error) {
      console.error("Meta API error:", metaData.error);
      return new Response(JSON.stringify({ error: metaData.error.message }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch USD→BRL exchange rate
    let usdToBrl = 5.0;
    try {
      const fxRes = await fetch("https://open.er-api.com/v6/latest/USD");
      const fxData = await fxRes.json();
      if (fxData.rates?.BRL) usdToBrl = fxData.rates.BRL;
    } catch (e) {
      console.error("Exchange rate fetch failed, using fallback:", e);
    }

    const campaigns = (metaData.data || []).map((c: any) => ({
      campaign_id: c.campaign_id,
      campaign_name: c.campaign_name,
      spend: (parseFloat(c.spend || "0") * usdToBrl).toFixed(2),
      spend_usd: c.spend || "0",
      clicks: c.clicks || "0",
      impressions: c.impressions || "0",
    }));

    return new Response(
      JSON.stringify({ campaigns, exchange_rate: usdToBrl, currency: "BRL" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("meta-campaigns error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
