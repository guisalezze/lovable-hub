const corsHeaders = {
  "Access-Control-Allow-Origin": "https://crm.guisalezze.com",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const INSIGHTS_FIELDS = "spend,impressions,clicks,actions,video_play_actions,video_p75_watched_actions";
const PURCHASE_TYPES = ["offsite_conversion.fb_pixel_purchase", "purchase"];
const INITIATE_CHECKOUT_TYPES = ["initiate_checkout", "omni_initiated_checkout", "offsite_conversion.fb_pixel_initiate_checkout"];
const VIDEO_VIEW_TYPES = ["video_view"];
const FOLLOW_TYPES = ["onsite_conversion.follow"];

function sumActionTypes(actions: any[] | undefined, types: string[]): number {
  return (actions || [])
    .filter((a: any) => types.includes(a.action_type))
    .reduce((s: number, a: any) => s + Number(a.value || 0), 0);
}

function sumAll(actions: any[] | undefined): number {
  return (actions || []).reduce((s: number, a: any) => s + Number(a.value || 0), 0);
}

function extractInsightMetrics(day: any) {
  return {
    conversions: sumActionTypes(day.actions, PURCHASE_TYPES),
    initiateCheckout: sumActionTypes(day.actions, INITIATE_CHECKOUT_TYPES),
    videoView: sumActionTypes(day.actions, VIDEO_VIEW_TYPES),
    follows: sumActionTypes(day.actions, FOLLOW_TYPES),
    videoPlays: sumAll(day.video_play_actions),
    videoP75Watched: sumAll(day.video_p75_watched_actions),
  };
}

async function syncAccount(adminClient: any, account: any) {
  const token = account.access_token;
  const actId = `act_${account.account_id}`;
  const today = new Date().toISOString().split("T")[0];
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const campaignsRes = await fetch(
    `https://graph.facebook.com/v21.0/${actId}/campaigns?fields=name,status,objective,daily_budget,lifetime_budget,bid_amount&limit=100&access_token=${token}`
  );
  const campaignsData = await campaignsRes.json();
  if (campaignsData.error) {
    console.error(`meta-sync: account ${account.id} campaigns error`, campaignsData.error);
    return { account_id: account.id, error: campaignsData.error.message };
  }

  let syncedCampaigns = 0, syncedAdsets = 0, syncedAds = 0;

  for (const campaign of (campaignsData.data || [])) {
    const insightsRes = await fetch(
      `https://graph.facebook.com/v21.0/${campaign.id}/insights?fields=${INSIGHTS_FIELDS}&time_range={"since":"${since}","until":"${today}"}&time_increment=1&access_token=${token}`
    );
    const insightsData = await insightsRes.json();

    for (const day of (insightsData.data || [])) {
      const m = extractInsightMetrics(day);

      const { data: campaignRow, error: campaignErr } = await adminClient
        .from("meta_campaigns")
        .upsert({
          ad_account_id: account.id,
          campaign_id: campaign.id,
          campaign_name: campaign.name,
          status: campaign.status,
          objective: campaign.objective,
          daily_budget: campaign.daily_budget ? Number(campaign.daily_budget) / 100 : null,
          lifetime_budget: campaign.lifetime_budget ? Number(campaign.lifetime_budget) / 100 : null,
          bid_amount: campaign.bid_amount ? Number(campaign.bid_amount) / 100 : null,
          spend: Number(day.spend || 0),
          impressions: Number(day.impressions || 0),
          clicks: Number(day.clicks || 0),
          conversions: m.conversions,
          initiate_checkout: m.initiateCheckout,
          video_view: m.videoView,
          video_plays: m.videoPlays,
          video_p75_watched: m.videoP75Watched,
          follows: m.follows,
          date: day.date_start,
        }, { onConflict: "ad_account_id,campaign_id,date" })
        .select("id")
        .single();

      if (campaignErr || !campaignRow) {
        console.error("meta-sync: campaign upsert failed", campaignErr);
        continue;
      }
      syncedCampaigns++;

      const adsetsRes = await fetch(
        `https://graph.facebook.com/v21.0/${campaign.id}/adsets?fields=name,status,daily_budget,lifetime_budget,bid_amount&limit=100&access_token=${token}`
      );
      const adsetsData = await adsetsRes.json();
      if (adsetsData.error) continue;

      for (const adset of (adsetsData.data || [])) {
        const adsetInsightsRes = await fetch(
          `https://graph.facebook.com/v21.0/${adset.id}/insights?fields=${INSIGHTS_FIELDS}&time_range={"since":"${day.date_start}","until":"${day.date_start}"}&access_token=${token}`
        );
        const adsetInsightsData = await adsetInsightsRes.json();
        const adsetDay = (adsetInsightsData.data || [])[0];
        if (!adsetDay) continue;

        const am = extractInsightMetrics(adsetDay);

        const { data: adsetRow, error: adsetErr } = await adminClient
          .from("meta_adsets")
          .upsert({
            campaign_id: campaignRow.id,
            adset_id: adset.id,
            adset_name: adset.name,
            status: adset.status,
            daily_budget: adset.daily_budget ? Number(adset.daily_budget) / 100 : null,
            lifetime_budget: adset.lifetime_budget ? Number(adset.lifetime_budget) / 100 : null,
            bid_amount: adset.bid_amount ? Number(adset.bid_amount) / 100 : null,
            spend: Number(adsetDay.spend || 0),
            impressions: Number(adsetDay.impressions || 0),
            clicks: Number(adsetDay.clicks || 0),
            conversions: am.conversions,
            initiate_checkout: am.initiateCheckout,
            video_view: am.videoView,
            video_plays: am.videoPlays,
            video_p75_watched: am.videoP75Watched,
            follows: am.follows,
            date: day.date_start,
          }, { onConflict: "campaign_id,adset_id,date" })
          .select("id")
          .single();

        if (adsetErr || !adsetRow) {
          console.error("meta-sync: adset upsert failed", adsetErr);
          continue;
        }
        syncedAdsets++;

        const adsRes = await fetch(
          `https://graph.facebook.com/v21.0/${adset.id}/ads?fields=name,status,creative{thumbnail_url}&limit=100&access_token=${token}`
        );
        const adsData = await adsRes.json();
        if (adsData.error) continue;

        for (const ad of (adsData.data || [])) {
          const adInsightsRes = await fetch(
            `https://graph.facebook.com/v21.0/${ad.id}/insights?fields=${INSIGHTS_FIELDS}&time_range={"since":"${day.date_start}","until":"${day.date_start}"}&access_token=${token}`
          );
          const adInsightsData = await adInsightsRes.json();
          const adDay = (adInsightsData.data || [])[0];
          if (!adDay) continue;

          const adm = extractInsightMetrics(adDay);

          const { error: adErr } = await adminClient.from("meta_ads").upsert({
            adset_id: adsetRow.id,
            ad_id: ad.id,
            ad_name: ad.name,
            status: ad.status,
            creative_thumbnail_url: ad.creative?.thumbnail_url ?? null,
            spend: Number(adDay.spend || 0),
            impressions: Number(adDay.impressions || 0),
            clicks: Number(adDay.clicks || 0),
            conversions: adm.conversions,
            initiate_checkout: adm.initiateCheckout,
            video_view: adm.videoView,
            video_plays: adm.videoPlays,
            video_p75_watched: adm.videoP75Watched,
            follows: adm.follows,
            date: day.date_start,
          }, { onConflict: "adset_id,ad_id,date" });

          if (adErr) console.error("meta-sync: ad upsert failed", adErr);
          else syncedAds++;
        }
      }
    }
  }

  return { account_id: account.id, synced_campaigns: syncedCampaigns, synced_adsets: syncedAdsets, synced_ads: syncedAds };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let body: { ad_account_id?: string } = {};
    try { body = await req.json(); } catch { /* empty body is valid: sync-all mode */ }

    let accounts: any[];
    if (body.ad_account_id) {
      const { data: account } = await adminClient
        .from("meta_ad_accounts").select("*").eq("id", body.ad_account_id).single();
      if (!account) {
        return new Response(JSON.stringify({ error: "Account not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      accounts = [account];
    } else {
      const { data } = await adminClient.from("meta_ad_accounts").select("*").eq("is_active", true);
      accounts = data || [];
    }

    const results = [];
    for (const account of accounts) {
      results.push(await syncAccount(adminClient, account));
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
