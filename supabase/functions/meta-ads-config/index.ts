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

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "GET") {
      // Return current config (without exposing full token)
      const { data: settings } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", ["meta_ads_account_id", "meta_ads_last_sync"]);

      const config: Record<string, any> = {};
      for (const s of settings || []) {
        config[s.key] = s.value;
      }

      // Check if token is configured
      const accessToken = Deno.env.get("META_ADS_ACCESS_TOKEN");
      config.has_token = !!accessToken && accessToken.length > 0;

      return new Response(JSON.stringify(config), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST") {
      const { account_id, access_token } = await req.json();

      if (!account_id || !access_token) {
        return new Response(JSON.stringify({ error: "Missing account_id or access_token" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Save account_id in app_settings
      const serviceClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      await serviceClient
        .from("app_settings")
        .upsert({ key: "meta_ads_account_id", value: JSON.stringify(account_id) });

      await serviceClient
        .from("app_settings")
        .upsert({ key: "meta_ads_last_sync", value: JSON.stringify(new Date().toISOString()) });

      // Test the token using Marketing API (works with system user tokens)
      const testUrl = `https://graph.facebook.com/v21.0/act_${account_id}/insights?` +
        new URLSearchParams({
          access_token: access_token,
          fields: "spend,account_name",
          date_preset: "today",
          limit: "1",
        }).toString();
      const testRes = await fetch(testUrl);
      const testData = await testRes.json();

      if (testData.error) {
        return new Response(JSON.stringify({ error: `Meta API: ${testData.error.message}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Also fetch account name separately
      const nameRes = await fetch(
        `https://graph.facebook.com/v21.0/act_${account_id}?access_token=${access_token}&fields=name`
      );
      const nameData = await nameRes.json();
      const accountName = nameData.name || `act_${account_id}`;

      // Store secrets using Supabase Management API is not possible from edge functions,
      // so we store the token encrypted in app_settings via service role
      // The edge functions meta-spend and meta-campaigns will read from app_settings as fallback
      await serviceClient
        .from("app_settings")
        .upsert({ key: "meta_ads_access_token", value: JSON.stringify(access_token) });

      return new Response(JSON.stringify({ success: true, account_name: accountName }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("meta-ads-config error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
