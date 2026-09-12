import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Perfect Pay sale_status_enum mapping (numeric codes from docs)
// Códigos oficiais: https://help.perfectpay.com.br/article/597-integracao-via-webhook-com-a-perfect-pay
const SALE_STATUS_MAP: Record<number, string> = {
  0: "none",
  1: "pending",
  2: "approved",
  3: "in_process",
  4: "in_mediation",
  5: "rejected",
  6: "cancelled",
  7: "refunded",
  8: "authorized",
  9: "charged_back",
  10: "completed",
  11: "checkout_error",
  12: "precheckout",
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

const ID_RE = /^\d{6,}$/;
function splitNameId(value?: string | null): { name: string | null; id: string | null } {
  if (!value) return { name: null, id: null };
  let raw: string;
  try {
    raw = decodeURIComponent(String(value).replace(/\+/g, " ")).trim();
  } catch {
    // Malformed percent-encoding, treat as literal string
    raw = String(value).replace(/\+/g, " ").trim();
  }
  if (!raw) return { name: null, id: null };
  const cut = raw.lastIndexOf("|");
  if (cut === -1) return ID_RE.test(raw) ? { name: null, id: raw } : { name: raw, id: null };
  const name = raw.slice(0, cut).trim() || null;
  const tail = raw.slice(cut + 1).trim();
  return { name, id: ID_RE.test(tail) ? tail : null };
}

async function resolveAttribution(
  supabase: ReturnType<typeof createClient>,
  metadata: Record<string, unknown>
): Promise<{
  utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; utm_content: string | null;
  fbclid: string | null; fbp: string | null; fbc: string | null;
  campaign_id: string | null; adset_id: string | null; ad_id: string | null;
}> {
  const utm_source = (metadata.utm_source as string) || null;
  const utm_medium = (metadata.utm_medium as string) || null;
  const utm_campaign = (metadata.utm_campaign as string) || null;
  const utm_content = (metadata.utm_content as string) || null;
  let fbclid = (metadata.fbclid as string) || null;
  let fbp = (metadata.fbp as string) || null;
  let fbc = (metadata.fbc as string) || null;

  let campaign = splitNameId(utm_campaign);
  let adset = splitNameId(utm_medium);
  let ad = splitNameId(utm_content);

  const rtVid = (metadata.rt_vid as string) || null;
  if ((!ad.id || !fbclid) && rtVid) {
    const { data: visit } = await supabase
      .from("ad_visits")
      .select("*")
      .eq("rt_vid", rtVid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (visit) {
      campaign = campaign.id ? campaign : { name: visit.campaign_name, id: visit.campaign_id };
      adset = adset.id ? adset : { name: visit.adset_name, id: visit.adset_id };
      ad = ad.id ? ad : { name: visit.ad_name, id: visit.ad_id };
      fbclid = fbclid || visit.fbclid;
      fbp = fbp || visit.fbp;
      fbc = fbc || visit.fbc;
    }
  }

  return {
    utm_source, utm_medium, utm_campaign, utm_content,
    fbclid, fbp, fbc,
    campaign_id: campaign.id, adset_id: adset.id, ad_id: ad.id,
  };
}

async function resolveProjectId(
  req: Request,
  productCode: string | undefined,
  supabase: ReturnType<typeof createClient>
): Promise<string> {
  const url = new URL(req.url);
  const queryProjectId = url.searchParams.get("project_id");
  if (queryProjectId) return queryProjectId;

  if (productCode) {
    const { data: mapping } = await supabase
      .from("project_products")
      .select("project_id")
      .eq("source", "perfectpay")
      .eq("product_code", productCode)
      .maybeSingle();
    if (mapping) return mapping.project_id as string;
  }

  const { data: eduProject } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", "educacional")
    .single();
  return eduProject!.id as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    let payload: Record<string, unknown>;
    try {
      payload = (await req.json()) as Record<string, unknown>;
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log raw webhook
    await supabase.from("webhook_logs").insert({
      source: "perfectpay",
      payload,
    });

    const customer = payload.customer || {};
    const product = payload.product || {};
    const projectId = await resolveProjectId(req, product.code as string | undefined, supabase);
    const plan = payload.plan || {};
    const metadata = payload.metadata || {};
    const attribution = await resolveAttribution(supabase, metadata as Record<string, unknown>);

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
    let saleStatus = SALE_STATUS_MAP[rawStatus] || String(payload.sale_status_enum);

    // 8 (authorized) e 10 (completed) são estados de venda paga na PP; o CRM trata receita só como "approved"
    if (saleStatus === "authorized" || saleStatus === "completed") {
      saleStatus = "approved";
    }

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

    const countryStr = String(customer.country ?? "").toLowerCase();
    const phoneFromParts =
      customer.phone_area_code != null && customer.phone_number != null
        ? (() => {
            const ac = String(customer.phone_area_code).replace(/\D/g, "");
            const num = String(customer.phone_number).replace(/\D/g, "");
            if (!num) return null;
            const br = !countryStr || countryStr.includes("brasil") || countryStr === "br";
            return br ? `+55${ac}${num}` : `+${ac}${num}`;
          })()
        : null;

    // Build lead data from customer fields per Perfect Pay docs
    const leadData: Record<string, unknown> = {
      email,
      project_id: projectId,
      full_name: customer.full_name || null,
      phone_e164: customer.phone_formated_ddi || phoneFromParts,
      phone_formatted:
        customer.phone_formated ||
        customer.phone_formated_ddi ||
        (customer.phone_area_code != null && customer.phone_number != null
          ? `${String(customer.phone_area_code)} ${String(customer.phone_number)}`
          : null),
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
      .eq("project_id", projectId)
      .maybeSingle();

    if (existingLead) {
      await supabase.from("leads").update(leadData).eq("email", email).eq("project_id", projectId);
    } else {
      await supabase.from("leads").insert(leadData);
    }

    // Upsert sale (idempotent by code)
    const { error: saleError } = await supabase.from("sales").upsert(
      {
        code: saleCode,
        project_id: projectId,
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
        utm_source: attribution.utm_source,
        utm_medium: attribution.utm_medium,
        utm_campaign: attribution.utm_campaign,
        utm_content: attribution.utm_content,
        fbclid: attribution.fbclid,
        fbp: attribution.fbp,
        fbc: attribution.fbc,
        campaign_id: attribution.campaign_id,
        adset_id: attribution.adset_id,
        ad_id: attribution.ad_id,
      },
      { onConflict: "code" }
    );

    if (saleError) {
      console.error("Sale upsert error:", saleError);
    }

    if (!saleError && saleStatus === "approved") {
      fetch(`${supabaseUrl}/functions/v1/meta-capi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: "educacional",
          event_name: "Purchase",
          order_id: saleCode,
          value: saleAmount,
          currency: "BRL",
          email,
          fbp: attribution.fbp,
          fbc: attribution.fbc,
        }),
      }).catch((err) => console.error("meta-capi call failed:", err));
    }

    // Update lead_products if approved
    if (saleStatus === "approved" && product.code) {
      const { data: existingProduct } = await supabase
        .from("lead_products")
        .select("*")
        .eq("lead_email", email)
        .eq("product_code", product.code)
        .eq("project_id", projectId)
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
          project_id: projectId,
        });
      }
    }

    // If refund/chargeback, update lead_products status
    if ((saleStatus === "refunded" || saleStatus === "charged_back") && product.code) {
      await supabase
        .from("lead_products")
        .update({ last_status_enum: saleStatus })
        .eq("lead_email", email)
        .eq("product_code", product.code)
        .eq("project_id", projectId);
    }

    // ── Auto-create onboarding task + record on approved sale ──────────────
    if (saleStatus === "approved" && email) {
      const { data: lead } = await supabase
        .from("leads")
        .select("id, assigned_to, full_name")
        .eq("email", email)
        .eq("project_id", projectId)
        .single();

      if (lead) {
        const productName = product.name || "Produto";
        const buyerName = customer.full_name || lead.full_name || "Cliente";

        // Create onboarding task
        try {
          await supabase.from("tasks").insert({
            title: `Onboarding: ${buyerName} — ${productName}`,
            project_id: projectId,
            description: `Nova venda aprovada. Enviar link de onboarding e realizar primeira reunião.`,
            assigned_to: lead.assigned_to,
            status: "backlog",
            priority: "alta",
            due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          });
        } catch (_) {}

        // Auto-create onboarding_responses record
        try {
          await supabase.from("onboarding_responses").insert({
            lead_id: lead.id,
            project_id: projectId,
            assigned_to: lead.assigned_to,
          });
        } catch (_) {}
      }
    }

    // ── Auto-create charges for installment sales ────────────────────────
    if (saleStatus === "approved" && email && saleAmount > 0) {
      const rawInstallments = parseInt(
        String(
          (payload as Record<string, unknown>).installments ??
            metadata.installments ??
            plan.installments ??
            1
        ),
        10
      );
      if (rawInstallments > 1) {
        const { data: lead } = await supabase
          .from("leads")
          .select("id, full_name, assigned_to")
          .eq("email", email)
          .eq("project_id", projectId)
          .single();

        if (lead) {
          const installmentValue = saleAmount / rawInstallments;
          let chargeId: string | null = null;
          try {
            const { data: charge } = await supabase.from("charges").insert({
              product_name: product.name || "Produto",
              project_id: projectId,
              client_name: lead.full_name || email,
              total_ticket: saleAmount,
              entry_paid: installmentValue,
              installments_count: rawInstallments - 1,
              installment_value: installmentValue,
              assigned_to: lead.assigned_to,
              notes: `Criado automaticamente via PerfectPay. Código: ${saleCode}`,
            }).select("id").single();
            chargeId = charge?.id ?? null;
          } catch (_) {}

          if (chargeId) {
            const installments = Array.from({ length: rawInstallments - 1 }, (_, i) => {
              const dueDate = new Date();
              dueDate.setMonth(dueDate.getMonth() + i + 1);
              return {
                charge_id: chargeId,
                installment_number: i + 2,
                due_date: dueDate.toISOString().slice(0, 10),
                amount: installmentValue,
                status: "pending",
              };
            });
            if (installments.length > 0) {
              try {
                await supabase.from("charge_installments").insert(installments);
              } catch (_) {}
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
