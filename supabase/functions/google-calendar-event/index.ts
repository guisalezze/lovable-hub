import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://crm.guisalezze.com",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Refresh failed: ${JSON.stringify(data)}`);
  return data;
}

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

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = claimsData.claims.sub;
    const body = await req.json();
    const { title, start, end, type, target_user_id } = body; // type: "call" | "task"

    // Determine whose calendar to use: target_user_id (for task assignee) or caller
    const targetUserId = target_user_id || callerId;

    // Get tokens using service role
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: tokenRow, error: tokenError } = await supabaseAdmin
      .from("google_tokens")
      .select("*")
      .eq("user_id", targetUserId)
      .single();

    if (tokenError || !tokenRow) {
      return new Response(
        JSON.stringify({ error: "Google not connected" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let accessToken = tokenRow.access_token;

    // Refresh if expired
    if (new Date(tokenRow.expires_at) <= new Date()) {
      const refreshed = await refreshAccessToken(tokenRow.refresh_token);
      accessToken = refreshed.access_token;
      const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      await supabaseAdmin
        .from("google_tokens")
        .update({ access_token: accessToken, expires_at: newExpiry })
        .eq("user_id", targetUserId);
    }

    // Build calendar event
    let eventBody: Record<string, unknown>;

    if (type === "task") {
      // All-day event
      const dateStr = start.split("T")[0];
      eventBody = {
        summary: title,
        start: { date: dateStr },
        end: { date: dateStr },
      };
    } else {
      // Timed event (call)
      eventBody = {
        summary: title,
        start: { dateTime: start, timeZone: "America/Sao_Paulo" },
        end: {
          dateTime: end || new Date(new Date(start).getTime() + 30 * 60000).toISOString(),
          timeZone: "America/Sao_Paulo",
        },
        conferenceData: {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      };
    }

    const calendarUrl =
      "https://www.googleapis.com/calendar/v3/calendars/primary/events" +
      (type === "call" ? "?conferenceDataVersion=1" : "");

    const calRes = await fetch(calendarUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventBody),
    });

    const calData = await calRes.json();

    if (!calRes.ok) {
      console.error("Calendar API error:", calData);
      return new Response(
        JSON.stringify({ error: "Failed to create calendar event" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const meetLink = calData.conferenceData?.entryPoints?.find(
      (ep: { entryPointType: string }) => ep.entryPointType === "video"
    )?.uri || null;

    return new Response(
      JSON.stringify({
        eventId: calData.id,
        meetLink,
        htmlLink: calData.htmlLink,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "An error occurred processing your request" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
