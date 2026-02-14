import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
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

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
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

    // Priority: env secrets > app_settings fallback
    let accessToken = Deno.env.get("META_ADS_ACCESS_TOKEN") || "";
    let accountId = Deno.env.get("META_ADS_ACCOUNT_ID") || "";

    // Fallback: read from app_settings only for missing values
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (!accessToken || !accountId) {
      const { data: settings } = await serviceClient
        .from("app_settings")
        .select("key, value")
        .in("key", ["meta_ads_access_token", "meta_ads_account_id"]);

      for (const s of settings || []) {
        const val = typeof s.value === "string" ? s.value : JSON.stringify(s.value);
        const clean = val.replace(/^"|"$/g, "");
        if (!accessToken && s.key === "meta_ads_access_token" && clean) accessToken = clean;
        if (!accountId && s.key === "meta_ads_account_id" && clean) accountId = clean;
      }
    }

    if (!accessToken || !accountId) {
      return new Response(JSON.stringify({ error: "Meta credentials not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ensure we always use the correct account ID
    accountId = accountId.replace(/^act_/, "");
    console.log(`Fetching insights for act_${accountId} from ${since} to ${until}`);

    // Fetch daily spend from Meta Marketing API
    const metaUrl = `https://graph.facebook.com/v21.0/act_${accountId}/insights?` +
      new URLSearchParams({
        access_token: accessToken,
        fields: "spend",
        time_range: JSON.stringify({ since, until }),
        time_increment: "1",
        level: "account",
        limit: "500",
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
    let usdToBrl = 5.0; // fallback
    try {
      const fxRes = await fetch("https://open.er-api.com/v6/latest/USD");
      const fxData = await fxRes.json();
      if (fxData.rates?.BRL) {
        usdToBrl = fxData.rates.BRL;
      }
    } catch (e) {
      console.error("Exchange rate fetch failed, using fallback:", e);
    }

    console.log(`USD→BRL rate: ${usdToBrl}`);

    const daily = (metaData.data || []).map((d: any) => ({
      date_start: d.date_start,
      spend_usd: d.spend || "0",
      spend_brl: (parseFloat(d.spend || "0") * usdToBrl).toFixed(2),
    }));

    const totalSpendUsd = daily.reduce((sum: number, d: any) => sum + parseFloat(d.spend_usd), 0);
    const totalSpendBrl = totalSpendUsd * usdToBrl;

    console.log(`act_${accountId}: total_spend_usd=${totalSpendUsd}, total_spend_brl=${totalSpendBrl.toFixed(2)}, days=${daily.length}`);

    // Update last sync timestamp
    await serviceClient
      .from("app_settings")
      .upsert({ key: "meta_ads_last_sync", value: JSON.stringify(new Date().toISOString()) });

    return new Response(
      JSON.stringify({
        total_spend: totalSpendBrl,
        total_spend_usd: totalSpendUsd,
        exchange_rate: usdToBrl,
        currency: "BRL",
        daily,
        account_id: accountId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("meta-spend error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
