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
    const { ad_account_id } = await req.json();
    if (!ad_account_id) {
      return new Response(JSON.stringify({ error: "Missing ad_account_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: account } = await adminClient
      .from("meta_ad_accounts")
      .select("*")
      .eq("id", ad_account_id)
      .single();

    if (!account) {
      return new Response(JSON.stringify({ error: "Account not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = account.access_token;
    const actId = `act_${account.account_id}`;
    const today = new Date().toISOString().split("T")[0];
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // Fetch campaigns with insights
    const campaignsRes = await fetch(
      `https://graph.facebook.com/v21.0/${actId}/campaigns?fields=name,status,objective,daily_budget,lifetime_budget&limit=100&access_token=${token}`
    );
    const campaignsData = await campaignsRes.json();

    for (const campaign of (campaignsData.data || [])) {
      // Get insights
      const insightsRes = await fetch(
        `https://graph.facebook.com/v21.0/${campaign.id}/insights?fields=spend,impressions,clicks,actions&time_range={"since":"${since}","until":"${today}"}&time_increment=1&access_token=${token}`
      );
      const insightsData = await insightsRes.json();

      for (const day of (insightsData.data || [])) {
        const conversions = (day.actions || [])
          .filter((a: any) => a.action_type === "offsite_conversion.fb_pixel_purchase" || a.action_type === "purchase")
          .reduce((s: number, a: any) => s + Number(a.value || 0), 0);

        await adminClient.from("meta_campaigns").upsert({
          ad_account_id: ad_account_id,
          campaign_id: campaign.id,
          campaign_name: campaign.name,
          status: campaign.status,
          objective: campaign.objective,
          daily_budget: campaign.daily_budget ? Number(campaign.daily_budget) / 100 : null,
          lifetime_budget: campaign.lifetime_budget ? Number(campaign.lifetime_budget) / 100 : null,
          spend: Number(day.spend || 0),
          impressions: Number(day.impressions || 0),
          clicks: Number(day.clicks || 0),
          conversions: conversions,
          date: day.date_start,
        }, { onConflict: "id", ignoreDuplicates: false });
      }
    }

    return new Response(JSON.stringify({ success: true, synced_campaigns: (campaignsData.data || []).length }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
