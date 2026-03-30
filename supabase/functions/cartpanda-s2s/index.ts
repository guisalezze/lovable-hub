const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Verify CartPanda secret — mandatory
  const webhookSecret = Deno.env.get("CARTPANDA_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("CARTPANDA_WEBHOOK_SECRET not configured");
    return new Response(JSON.stringify({ error: "Webhook not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const providedToken = req.headers.get("X-Cartpanda-Token") || req.headers.get("Authorization")?.replace("Bearer ", "");
  if (providedToken !== webhookSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const payload = await req.json();
    
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get nutra project
    const { data: nutraProject } = await adminClient
      .from("projects")
      .select("id")
      .eq("slug", "nutra")
      .single();

    if (!nutraProject) {
      return new Response(JSON.stringify({ error: "Nutra project not found" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cartpanda S2S payload mapping
    const sale = {
      project_id: nutraProject.id,
      source: "cartpanda",
      order_id: payload.order_id || payload.id?.toString(),
      customer_name: payload.customer?.name || payload.billing_address?.name,
      customer_email: payload.customer?.email || payload.email,
      customer_phone: payload.customer?.phone || payload.phone,
      product_name: payload.line_items?.[0]?.title || payload.product_name,
      product_id: payload.line_items?.[0]?.product_id?.toString(),
      amount: Number(payload.total_price || payload.amount || 0),
      currency: payload.currency || "BRL",
      status: mapCartpandaStatus(payload.financial_status || payload.status),
      payment_method: payload.payment_method || payload.gateway,
      tracking_code: payload.fulfillments?.[0]?.tracking_number,
      utm_source: payload.utm_source || payload.note_attributes?.find((n: any) => n.name === "utm_source")?.value,
      utm_medium: payload.utm_medium || payload.note_attributes?.find((n: any) => n.name === "utm_medium")?.value,
      utm_campaign: payload.utm_campaign || payload.note_attributes?.find((n: any) => n.name === "utm_campaign")?.value,
      raw_payload: payload,
    };

    // Upsert by order_id
    if (sale.order_id) {
      const { data: existing } = await adminClient
        .from("nutra_sales")
        .select("id")
        .eq("source", "cartpanda")
        .eq("order_id", sale.order_id)
        .maybeSingle();

      if (existing) {
        await adminClient.from("nutra_sales").update(sale).eq("id", existing.id);
      } else {
        await adminClient.from("nutra_sales").insert(sale);
      }
    } else {
      await adminClient.from("nutra_sales").insert(sale);
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

function mapCartpandaStatus(status: string): string {
  const map: Record<string, string> = {
    paid: "approved",
    pending: "pending",
    refunded: "refunded",
    cancelled: "canceled",
    authorized: "pending",
    partially_paid: "pending",
  };
  return map[status?.toLowerCase()] || status || "pending";
}
