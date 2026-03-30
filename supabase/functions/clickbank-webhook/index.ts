import { createHmac } from "https://deno.land/std@0.208.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.text();
    const payload = JSON.parse(body);

    // Verify ClickBank secret — mandatory
    const secretKey = Deno.env.get("CLICKBANK_SECRET_KEY");
    if (!secretKey) {
      console.error("CLICKBANK_SECRET_KEY not configured");
      return new Response(JSON.stringify({ error: "Webhook not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const providedKey = req.headers.get("X-Clickbank-Key") || req.headers.get("Authorization")?.replace("Bearer ", "");
    if (providedKey !== secretKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!payload.transactionType) {
      return new Response(JSON.stringify({ error: "Invalid ClickBank payload" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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

    const sale = {
      project_id: nutraProject.id,
      source: "clickbank",
      order_id: payload.receipt || payload.transactionId,
      customer_name: `${payload.firstName || ""} ${payload.lastName || ""}`.trim(),
      customer_email: payload.email || payload.customerEmail,
      customer_phone: payload.phoneNumber,
      product_name: payload.itemName || payload.productTitle,
      product_id: payload.itemNo || payload.productId,
      amount: Number(payload.totalOrderAmount || payload.orderAmount || 0),
      currency: payload.currency || "USD",
      status: mapClickBankStatus(payload.transactionType),
      payment_method: "clickbank",
      utm_source: payload.affiliate,
      utm_campaign: payload.campaignId || payload.tid,
      raw_payload: payload,
    };

    if (sale.order_id) {
      const { data: existing } = await adminClient
        .from("nutra_sales")
        .select("id")
        .eq("source", "clickbank")
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

function mapClickBankStatus(type: string): string {
  const map: Record<string, string> = {
    SALE: "approved",
    BILL: "approved",
    RFND: "refunded",
    CGBK: "chargeback",
    CANCEL: "canceled",
    TEST: "pending",
    TEST_SALE: "pending",
  };
  return map[type?.toUpperCase()] || type || "pending";
}
