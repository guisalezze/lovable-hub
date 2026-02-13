import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const payload = await req.json();

    // Log raw webhook
    await supabase.from("webhook_logs").insert({
      source: "perfectpay",
      payload,
    });

    const customer = payload.customer || {};
    const product = payload.product || {};
    const plan = payload.plan || {};
    const metadata = payload.metadata || {};

    const email = customer.email?.toLowerCase()?.trim();
    if (!email) {
      return new Response(JSON.stringify({ error: "No email in payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const saleCode = payload.sale_code || payload.code || `${Date.now()}`;
    const saleAmount = parseFloat(payload.sale_amount || "0");
    const saleStatus = payload.sale_status_enum || "pending";

    // Upsert lead
    const leadData = {
      email,
      full_name: customer.full_name || null,
      phone_e164: customer.phone_formated_ddi || customer.phone_e164 || null,
      phone_formatted: customer.phone_formated_ddi || customer.phone_formatted || null,
      last_sale_status_enum: saleStatus,
      last_sale_amount: saleAmount,
      last_product: product.name || null,
      last_date_created: payload.date_created || new Date().toISOString(),
      last_date_approved: payload.date_approved || null,
      last_payment_type: payload.payment_type_enum || null,
      last_billet_url: payload.billet_url || null,
      utm_source: metadata.utm_source || null,
      utm_medium: metadata.utm_medium || null,
      utm_campaign: metadata.utm_campaign || null,
      utm_content: metadata.utm_content || null,
      utm_term: metadata.utm_term || null,
      src: metadata.src || null,
    };

    // Determine lead status
    let leadStatus = "novo";
    if (saleStatus === "approved" || saleStatus === "complete") {
      leadStatus = "comprou";
    } else if (saleStatus === "pending") {
      leadStatus = "quase_comprou";
    } else if (saleStatus === "refunded" || saleStatus === "chargeback" || saleStatus === "canceled") {
      leadStatus = "perdido";
    }

    const { data: existingLead } = await supabase
      .from("leads")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingLead) {
      await supabase
        .from("leads")
        .update({ ...leadData, status: leadStatus })
        .eq("email", email);
    } else {
      await supabase
        .from("leads")
        .insert({ ...leadData, status: leadStatus });
    }

    // Upsert sale (idempotent by code)
    const { error: saleError } = await supabase.from("sales").upsert(
      {
        code: saleCode,
        lead_email: email,
        sale_amount: saleAmount,
        sale_status_enum: saleStatus,
        sale_status_detail: payload.sale_status_detail || null,
        product_code: product.code || null,
        product_name: product.name || null,
        plan_code: plan.code || null,
        plan_name: plan.name || null,
        payment_type_enum: payload.payment_type_enum || null,
        payment_method_enum: payload.payment_method_enum || null,
        checkout_type_enum: payload.checkout_type_enum || null,
        billet_url: payload.billet_url || null,
        date_created: payload.date_created || null,
        date_approved: payload.date_approved || null,
      },
      { onConflict: "code" }
    );

    if (saleError) {
      console.error("Sale upsert error:", saleError);
    }

    // Update lead_products if approved
    if (
      (saleStatus === "approved" || saleStatus === "complete") &&
      product.code
    ) {
      const { data: existingProduct } = await supabase
        .from("lead_products")
        .select("*")
        .eq("lead_email", email)
        .eq("product_code", product.code)
        .maybeSingle();

      if (existingProduct) {
        await supabase
          .from("lead_products")
          .update({
            total_purchases_count: existingProduct.total_purchases_count + 1,
            total_paid_amount:
              Number(existingProduct.total_paid_amount) + saleAmount,
            last_purchase_at: new Date().toISOString(),
            last_status_enum: saleStatus,
          })
          .eq("id", existingProduct.id);
      } else {
        await supabase.from("lead_products").insert({
          lead_email: email,
          product_code: product.code,
          product_name: product.name || null,
          plan_code: plan.code || null,
          total_purchases_count: 1,
          total_paid_amount: saleAmount,
          last_purchase_at: new Date().toISOString(),
          last_status_enum: saleStatus,
        });
      }
    }

    // Update webhook log as processed
    await supabase
      .from("webhook_logs")
      .update({ processed: true })
      .eq("payload->>sale_code", saleCode);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
