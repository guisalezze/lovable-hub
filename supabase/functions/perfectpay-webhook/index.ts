import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Perfect Pay sale_status_enum mapping (numeric codes from docs)
const SALE_STATUS_MAP: Record<number, string> = {
  0: "none",
  1: "pending",
  2: "approved",
  3: "in_process",
  4: "in_mediation",
  5: "rejected",
  6: "cancelled",
  7: "refunded",
  9: "charged_back",
  11: "checkout_error",
  12: "abandono",
  13: "expired",
  16: "in_review",
  17: "pre_chargeback",
  18: "pre_refunded",
};

// payment_type_enum mapping
const PAYMENT_TYPE_MAP: Record<number, string> = {
  0: "none",
  1: "credit_card",
  2: "ticket",
  3: "paypal",
  4: "credit_card_recurrent",
  5: "free_price",
  6: "credit_card_upsell",
  7: "pix",
};

// payment_method_enum mapping
const PAYMENT_METHOD_MAP: Record<number, string> = {
  0: "none",
  1: "visa",
  2: "bolbradesco",
  3: "amex",
  4: "elo",
  5: "hipercard",
  6: "master",
  7: "melicard",
  8: "free_price",
  9: "pix",
  10: "discover",
  11: "diners_club",
  12: "jcb",
  13: "sorocred",
  14: "fort_brasil",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Verify webhook secret
    const webhookSecret = Deno.env.get("PERFECTPAY_WEBHOOK_SECRET");
    if (webhookSecret) {
      const providedToken = req.headers.get("X-Webhook-Token") || req.headers.get("Authorization")?.replace("Bearer ", "");
      if (providedToken !== webhookSecret) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

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

    const email = (customer.email || "")?.toLowerCase()?.trim();
    
    // Validate required fields
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate sale_amount
    const rawSaleAmount = parseFloat(payload.sale_amount || "0");
    if (isNaN(rawSaleAmount) || rawSaleAmount < 0 || rawSaleAmount > 999999999) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate string field lengths
    const maxLen = (val: string | undefined | null, max: number) =>
      typeof val === "string" ? val.slice(0, max) : val;

    const saleCode = (payload.code || `PP-${Date.now()}`).slice(0, 100);
    const saleAmount = rawSaleAmount;

    // Convert numeric enums to readable strings
    const rawStatus = typeof payload.sale_status_enum === "number"
      ? payload.sale_status_enum
      : parseInt(payload.sale_status_enum || "0", 10);
    const saleStatus = SALE_STATUS_MAP[rawStatus] || String(payload.sale_status_enum);

    const rawPaymentType = typeof payload.payment_type_enum === "number"
      ? payload.payment_type_enum
      : parseInt(payload.payment_type_enum || "0", 10);
    const paymentType = PAYMENT_TYPE_MAP[rawPaymentType] || String(payload.payment_type_enum);

    const rawPaymentMethod = typeof payload.payment_method_enum === "number"
      ? payload.payment_method_enum
      : parseInt(payload.payment_method_enum || "0", 10);
    const paymentMethod = PAYMENT_METHOD_MAP[rawPaymentMethod] || String(payload.payment_method_enum);

    const checkoutType = payload.checkout_type_enum || "default";

    // Determine lead status based on sale status
    let leadStatus = "novo";
    if (saleStatus === "approved") {
      leadStatus = "comprou";
    } else if (saleStatus === "pending" || saleStatus === "in_process" || saleStatus === "in_review") {
      leadStatus = "quase_comprou";
    } else if (
      saleStatus === "refunded" ||
      saleStatus === "charged_back" ||
      saleStatus === "cancelled" ||
      saleStatus === "rejected" ||
      saleStatus === "pre_chargeback" ||
      saleStatus === "pre_refunded"
    ) {
      leadStatus = "perdido";
    }

    // Build lead data from customer fields per Perfect Pay docs
    const leadData: Record<string, unknown> = {
      email,
      full_name: customer.full_name || null,
      phone_e164: customer.phone_formated_ddi || null,
      phone_formatted: customer.phone_formated || customer.phone_formated_ddi || null,
      city: customer.city || null,
      state: customer.state || null,
      country: customer.country || null,
      last_sale_status_enum: saleStatus,
      last_sale_amount: saleAmount,
      last_product: product.name || null,
      last_date_created: payload.date_created || new Date().toISOString(),
      last_date_approved: payload.date_approved || null,
      last_payment_type: paymentType,
      last_billet_url: payload.billet_url || null,
      utm_source: metadata.utm_source || null,
      utm_medium: metadata.utm_medium || null,
      utm_campaign: metadata.utm_campaign || null,
      utm_content: metadata.utm_content || null,
      utm_term: metadata.utm_term || null,
      src: metadata.src || null,
      status: leadStatus,
    };

    // Upsert lead
    const { data: existingLead } = await supabase
      .from("leads")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingLead) {
      await supabase.from("leads").update(leadData).eq("email", email);
    } else {
      await supabase.from("leads").insert(leadData);
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
        payment_type_enum: paymentType,
        payment_method_enum: paymentMethod,
        checkout_type_enum: checkoutType,
        billet_url: payload.billet_url || null,
        date_created: payload.date_created || new Date().toISOString(),
        // Garantir que date_approved nunca fica null em vendas aprovadas
        date_approved: payload.date_approved ||
          (saleStatus === "approved" ? (payload.date_created || new Date().toISOString()) : null),
      },
      { onConflict: "code" }
    );

    if (saleError) {
      console.error("Sale upsert error:", saleError);
    }

    // Update lead_products if approved
    if (saleStatus === "approved" && product.code) {
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
            total_paid_amount: Number(existingProduct.total_paid_amount) + saleAmount,
            last_purchase_at: new Date().toISOString(),
            last_status_enum: saleStatus,
            product_name: product.name || existingProduct.product_name,
            plan_code: plan.code || existingProduct.plan_code,
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

    // If refund/chargeback, update lead_products status
    if ((saleStatus === "refunded" || saleStatus === "charged_back") && product.code) {
      await supabase
        .from("lead_products")
        .update({ last_status_enum: saleStatus })
        .eq("lead_email", email)
        .eq("product_code", product.code);
    }

    // ── Auto-create onboarding task + record on approved sale ──────────────
    if (saleStatus === "approved" && email) {
      const { data: lead } = await supabase
        .from("leads")
        .select("id, assigned_to, full_name")
        .eq("email", email)
        .single();

      if (lead) {
        const productName = product.name || "Produto";
        const buyerName = customer.full_name || lead.full_name || "Cliente";

        // Create onboarding task
        await supabase.from("tasks").insert({
          title: `Onboarding: ${buyerName} — ${productName}`,
          description: `Nova venda aprovada. Enviar link de onboarding e realizar primeira reunião.`,
          assigned_to: lead.assigned_to,
          status: "backlog",
          priority: "alta",
          due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        }).catch(() => {});

        // Auto-create onboarding_responses record
        await supabase.from("onboarding_responses").insert({
          lead_id: lead.id,
          assigned_to: lead.assigned_to,
        }).catch(() => {});
      }
    }

    // ── Auto-create charges for installment sales ────────────────────────
    if (saleStatus === "approved" && email && saleAmount > 0) {
      const rawInstallments = parseInt(String(metadata.installments || plan.installments || 1), 10);
      if (rawInstallments > 1) {
        const { data: lead } = await supabase
          .from("leads")
          .select("id, full_name, assigned_to")
          .eq("email", email)
          .single();

        if (lead) {
          const installmentValue = saleAmount / rawInstallments;
          const { data: charge } = await supabase.from("charges").insert({
            product_name: product.name || "Produto",
            client_name: lead.full_name || email,
            total_ticket: saleAmount,
            entry_paid: installmentValue,
            installments_count: rawInstallments - 1,
            installment_value: installmentValue,
            assigned_to: lead.assigned_to,
            notes: `Criado automaticamente via PerfectPay. Código: ${saleCode}`,
          }).select("id").single().catch(() => ({ data: null }));

          if (charge?.id) {
            const installments = Array.from({ length: rawInstallments - 1 }, (_, i) => {
              const dueDate = new Date();
              dueDate.setMonth(dueDate.getMonth() + i + 1);
              return {
                charge_id: charge.id,
                installment_number: i + 2,
                due_date: dueDate.toISOString().slice(0, 10),
                amount: installmentValue,
                status: "pending",
              };
            });
            if (installments.length > 0) {
              await supabase.from("charge_installments").insert(installments).catch(() => {});
            }
          }
        }
      }
    }

    // Mark webhook as processed
    await supabase
      .from("webhook_logs")
      .update({ processed: true })
      .eq("payload->>code", saleCode);

    return new Response(JSON.stringify({ success: true, status: saleStatus }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: "An error occurred processing your request" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
