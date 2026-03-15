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

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (req.method === "GET") {
      const url = new URL(req.url);
      const projectId = url.searchParams.get("project_id");

      if (projectId) {
        // Return project-specific config from meta_ad_accounts table
        const { data: account } = await serviceClient
          .from("meta_ad_accounts")
          .select("account_id, account_name, updated_at, is_active")
          .eq("project_id", projectId)
          .eq("is_active", true)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        return new Response(JSON.stringify({
          meta_ads_account_id: account?.account_id || null,
          account_name: account?.account_name || null,
          meta_ads_last_sync: account?.updated_at || null,
          has_token: !!account?.account_id,
          configured: !!account?.account_id,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Backward compat: global config from app_settings
      const { data: settings } = await serviceClient
        .from("app_settings")
        .select("key, value")
        .in("key", ["meta_ads_account_id", "meta_ads_last_sync"]);

      const config: Record<string, any> = {};
      for (const s of settings || []) {
        config[s.key] = s.value;
      }
      const accessToken = Deno.env.get("META_ADS_ACCESS_TOKEN");
      config.has_token = !!accessToken && accessToken.length > 0;

      return new Response(JSON.stringify(config), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST") {
      const { account_id, access_token, project_id } = await req.json();

      if (!account_id || !access_token) {
        return new Response(JSON.stringify({ error: "Missing account_id or access_token" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Test the token using Marketing API
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

      // Fetch account name
      const nameRes = await fetch(
        `https://graph.facebook.com/v21.0/act_${account_id}?access_token=${access_token}&fields=name`
      );
      const nameData = await nameRes.json();
      const accountName = nameData.name || `act_${account_id}`;

      if (project_id) {
        // Store per-project in meta_ad_accounts table (source of truth)
        const { data: existing } = await serviceClient
          .from("meta_ad_accounts")
          .select("id")
          .eq("project_id", project_id)
          .maybeSingle();

        if (existing) {
          await serviceClient
            .from("meta_ad_accounts")
            .update({
              account_id,
              account_name: accountName,
              access_token,
              is_active: true,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        } else {
          await serviceClient
            .from("meta_ad_accounts")
            .insert({
              project_id,
              account_id,
              account_name: accountName,
              access_token,
              is_active: true,
            });
        }

        // Also store project-specific keys in app_settings as fallback for edge functions
        const cleanId = account_id.replace(/^act_/, "");
        await serviceClient.from("app_settings").upsert({
          key: `meta_ads_account_id_${project_id}`,
          value: JSON.stringify(cleanId),
          updated_at: new Date().toISOString(),
        });
        await serviceClient.from("app_settings").upsert({
          key: `meta_ads_access_token_${project_id}`,
          value: JSON.stringify(access_token),
          updated_at: new Date().toISOString(),
        });
        await serviceClient.from("app_settings").upsert({
          key: `meta_ads_last_sync_${project_id}`,
          value: JSON.stringify(new Date().toISOString()),
          updated_at: new Date().toISOString(),
        });
      } else {
        // Backward compat: global keys in app_settings
        const cleanId = account_id.replace(/^act_/, "");
        await serviceClient.from("app_settings").upsert({
          key: "meta_ads_account_id",
          value: JSON.stringify(cleanId),
        });
        await serviceClient.from("app_settings").upsert({
          key: "meta_ads_access_token",
          value: JSON.stringify(access_token),
        });
        await serviceClient.from("app_settings").upsert({
          key: "meta_ads_last_sync",
          value: JSON.stringify(new Date().toISOString()),
        });
      }

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
