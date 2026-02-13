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

    const accessToken = Deno.env.get("META_ADS_ACCESS_TOKEN");
    const accountId = Deno.env.get("META_ADS_ACCOUNT_ID");

    if (!accessToken || !accountId) {
      return new Response(JSON.stringify({ error: "Meta credentials not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const daily = (metaData.data || []).map((d: any) => ({
      date_start: d.date_start,
      spend: d.spend || "0",
    }));

    const totalSpend = daily.reduce((sum: number, d: any) => sum + parseFloat(d.spend), 0);

    return new Response(
      JSON.stringify({ total_spend: totalSpend, daily }),
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
