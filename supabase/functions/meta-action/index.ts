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
    const { action, campaign_id, value } = await req.json();
    if (!action || !campaign_id) {
      return new Response(JSON.stringify({ error: "Missing action or campaign_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find campaign and get account token
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

    const token = (campaign as any).meta_ad_accounts.access_token;
    let updateData: Record<string, string> = {};

    switch (action) {
      case "pause":
        updateData = { status: "PAUSED" };
        break;
      case "resume":
        updateData = { status: "ACTIVE" };
        break;
      case "budget":
        if (!value) throw new Error("Missing budget value");
        updateData = { daily_budget: String(Number(value) * 100) };
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    const metaRes = await fetch(
      `https://graph.facebook.com/v21.0/${campaign_id}`,
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
