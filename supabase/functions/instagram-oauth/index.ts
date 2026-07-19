import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APP_ID = Deno.env.get("IG_APP_ID")!;
const APP_SECRET = Deno.env.get("IG_APP_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRM_URL = "https://crm.guisalezze.com";
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/instagram-oauth`;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return Response.redirect(`${CRM_URL}/instagram-automacoes?error=oauth_denied`, 302);
  }

  // Sem code = início do fluxo OAuth
  if (!code) {
    const authUrl = new URL("https://www.instagram.com/oauth/authorize");
    authUrl.searchParams.set("client_id", APP_ID);
    authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.set(
      "scope",
      "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments"
    );
    authUrl.searchParams.set("response_type", "code");
    return Response.redirect(authUrl.toString(), 302);
  }

  // Tem code = callback do Instagram
  try {
    // Token curto
    const shortRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: APP_ID,
        client_secret: APP_SECRET,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
        code,
      }),
    });
    const shortData = await shortRes.json();
    if (!shortData.access_token) throw new Error(`short_token_failed: ${JSON.stringify(shortData)}`);

    // Token longo (60 dias)
    const longRes = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${APP_SECRET}&access_token=${shortData.access_token}`
    );
    const longData = await longRes.json();
    if (!longData.access_token) throw new Error(`long_token_failed: ${JSON.stringify(longData)}`);

    // Perfil do usuário
    const profileRes = await fetch(
      `https://graph.instagram.com/v25.0/me?fields=user_id,username,name,profile_picture_url&access_token=${longData.access_token}`
    );
    const profile = await profileRes.json();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    await supabase.from("ig_config").upsert(
      {
        instagram_user_id: profile.user_id,
        username: profile.username,
        name: profile.name,
        profile_picture_url: profile.profile_picture_url,
        access_token: longData.access_token,
        token_expires_at: new Date(Date.now() + (longData.expires_in ?? 5184000) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "instagram_user_id" }
    );

    // Assina os campos de webhook para esta conta
    await fetch(
      `https://graph.instagram.com/v25.0/${profile.user_id}/subscribed_apps?subscribed_fields=comments,messages&access_token=${longData.access_token}`,
      { method: "POST" }
    );

    return Response.redirect(`${CRM_URL}/instagram-automacoes?connected=1`, 302);
  } catch (e: unknown) {
    return Response.redirect(
      `${CRM_URL}/instagram-automacoes?error=${encodeURIComponent(String(e))}`,
      302
    );
  }
});
