import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Produção + qualquer porta de localhost/127.0.0.1 (desenvolvimento local)
const PROD_ORIGIN = "https://crm.guisalezze.com";
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function buildCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = origin === PROD_ORIGIN || LOCAL_ORIGIN.test(origin) ? origin : PROD_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return new Response(JSON.stringify({ error: "Invalid credentials" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service role client — bypasses RLS to look up email
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: alias } = await serviceClient
      .from("username_aliases")
      .select("email")
      .eq("username", username.toLowerCase().trim())
      .maybeSingle();

    if (!alias) {
      // Same error as wrong password — don't reveal whether username exists
      return new Response(JSON.stringify({ error: "Invalid credentials" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sign in with the resolved email using anon client
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );

    const { data, error } = await anonClient.auth.signInWithPassword({
      email: alias.email,
      password,
    });

    if (error || !data.session) {
      return new Response(JSON.stringify({ error: "Invalid credentials" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ session: data.session }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("resolve-username error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
