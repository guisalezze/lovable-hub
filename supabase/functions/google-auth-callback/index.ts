import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // user_id

    if (!code || !state) {
      return new Response("Missing code or state", { status: 400 });
    }

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-auth-callback`;

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("Token exchange failed:", tokenData);
      return new Response("Failed to exchange token", { status: 400 });
    }

    const expiresAt = new Date(
      Date.now() + (tokenData.expires_in || 3600) * 1000
    ).toISOString();

    // Save tokens using service role
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error } = await supabase.from("google_tokens").upsert(
      {
        user_id: state,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt,
      },
      { onConflict: "user_id" }
    );

    if (error) {
      console.error("Error saving tokens:", error);
      return new Response("Failed to save tokens", { status: 500 });
    }

    // Get the project's site URL for redirect
    const siteUrl =
      Deno.env.get("SITE_URL") ||
      "https://id-preview--536953bf-b30e-47df-b0b4-1647d8e7c879.lovable.app";

    return new Response(null, {
      status: 302,
      headers: {
        Location: `${siteUrl}/integracoes?google=connected`,
      },
    });
  } catch (err) {
    console.error("Callback error:", err);
    return new Response("Internal error", { status: 500 });
  }
});
