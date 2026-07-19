import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: config } = await supabase.from("ig_config").select("*").limit(1).single();
  if (!config?.access_token) return new Response("No config", { status: 200 });

  const res = await fetch(
    `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${config.access_token}`
  );
  const data = await res.json();
  if (!data.access_token) return new Response(`Refresh failed: ${JSON.stringify(data)}`, { status: 500 });

  await supabase
    .from("ig_config")
    .update({
      access_token: data.access_token,
      token_expires_at: new Date(Date.now() + (data.expires_in ?? 5184000) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("instagram_user_id", config.instagram_user_id);

  return new Response("Token renovado", { status: 200 });
});
