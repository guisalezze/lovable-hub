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
    const body = await req.json();
    const { action } = body;
    if (!action) {
      return new Response(JSON.stringify({ error: "Missing action" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let graphObjectId: string;
    let token: string;
    let updateData: Record<string, string> = {};

    if (action === "budget") {
      const { level, id, budget_type, value } = body;
      if (!level || !id || !budget_type || value == null) {
        return new Response(JSON.stringify({ error: "Missing level, id, budget_type or value" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (level !== "campaign" && level !== "adset") {
        return new Response(JSON.stringify({ error: "level must be 'campaign' or 'adset'" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (budget_type !== "daily" && budget_type !== "lifetime") {
        return new Response(JSON.stringify({ error: "budget_type must be 'daily' or 'lifetime'" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (level === "campaign") {
        const { data: campaign } = await adminClient
          .from("meta_campaigns")
          .select("campaign_id, meta_ad_accounts!inner(access_token)")
          .eq("campaign_id", id)
          .order("date", { ascending: false })
          .limit(1)
          .single();
        if (!campaign) {
          return new Response(JSON.stringify({ error: "Campaign not found" }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        graphObjectId = id;
        token = (campaign as any).meta_ad_accounts.access_token;
      } else {
        const { data: adset } = await adminClient
          .from("meta_adsets")
          .select("adset_id, meta_campaigns!inner(meta_ad_accounts!inner(access_token))")
          .eq("adset_id", id)
          .order("date", { ascending: false })
          .limit(1)
          .single();
        if (!adset) {
          return new Response(JSON.stringify({ error: "Adset not found" }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        graphObjectId = id;
        token = (adset as any).meta_campaigns.meta_ad_accounts.access_token;
      }

      updateData = budget_type === "daily"
        ? { daily_budget: String(Math.round(Number(value) * 100)) }
        : { lifetime_budget: String(Math.round(Number(value) * 100)) };
    } else {
      const { campaign_id } = body;
      if (!campaign_id) {
        return new Response(JSON.stringify({ error: "Missing campaign_id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: campaign } = await adminClient
        .from("meta_campaigns")
        .select("*, meta_ad_accounts!inner(access_token)")
        .eq("campaign_id", campaign_id)
        .order("date", { ascending: false })
        .limit(1)
        .single();

      if (!campaign) {
        return new Response(JSON.stringify({ error: "Campaign not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      graphObjectId = campaign_id;
      token = (campaign as any).meta_ad_accounts.access_token;

      switch (action) {
        case "pause":
          updateData = { status: "PAUSED" };
          break;
        case "resume":
          updateData = { status: "ACTIVE" };
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    }

    const metaRes = await fetch(
      `https://graph.facebook.com/v21.0/${graphObjectId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...updateData, access_token: token }),
      }
    );

    const metaData = await metaRes.json();
    if (metaData.error) {
      return new Response(JSON.stringify({ error: metaData.error.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
