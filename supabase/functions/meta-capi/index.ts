// supabase/functions/meta-capi/index.ts
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface CapiPayload {
  project: "educacional" | "nutra";
  event_name: string;
  order_id: string;
  value: number;
  currency?: string;
  email?: string;
  phone?: string;
  fbp?: string;
  fbc?: string;
  client_ip?: string;
  user_agent?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const internalSecret = Deno.env.get("META_CAPI_INTERNAL_SECRET");
  const providedSecret = req.headers.get("x-internal-secret");
  if (!internalSecret || providedSecret !== internalSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: CapiPayload;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.project || !body.order_id || typeof body.value !== "number") {
    return new Response(JSON.stringify({ error: "project, order_id and value are required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const suffix = body.project === "nutra" ? "NUTRA" : "EDUCACIONAL";
  const pixelId = Deno.env.get(`META_PIXEL_ID_${suffix}`);
  const capiToken = Deno.env.get(`META_CAPI_TOKEN_${suffix}`);

  if (!pixelId || !capiToken) {
    console.error(`meta-capi: missing pixel/token secrets for ${suffix}`);
    return new Response(JSON.stringify({ error: `CAPI not configured for ${body.project}` }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userData: Record<string, unknown> = {};
  if (body.email) userData.em = [await sha256Hex(body.email)];
  if (body.phone) userData.ph = [await sha256Hex(body.phone.replace(/\D/g, ""))];
  if (body.fbp) userData.fbp = body.fbp;
  if (body.fbc) userData.fbc = body.fbc;
  if (body.client_ip) userData.client_ip_address = body.client_ip;
  if (body.user_agent) userData.client_user_agent = body.user_agent;

  const event = {
    event_name: body.event_name || "Purchase",
    event_time: Math.floor(Date.now() / 1000),
    event_id: body.order_id,
    action_source: "website",
    user_data: userData,
    custom_data: { value: body.value, currency: body.currency || "BRL" },
  };

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${capiToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [event] }),
    }
  );
  const result = await res.json();

  if (!res.ok) {
    console.error("meta-capi: Meta API error", result);
    return new Response(JSON.stringify({ ok: false, error: result }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, result }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
