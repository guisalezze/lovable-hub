import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://crm.guisalezze.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", payload.assigned_to)
      .single();

    const assigneeName = profile?.full_name || profile?.email || "Responsável";

    const fmtCurrency = (v: number) =>
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
    const fmtDate = (d: string) => {
      const [y, m, day] = d.split("-");
      return `${day}/${m}/${y}`;
    };

    const message = [
      `🔔 *Nova Cobrança Cadastrada*`,
      ``,
      `👤 Cliente: ${payload.client_name}`,
      `📦 Produto: ${payload.product_name}`,
      `💰 Parcelas: ${payload.installments_count}x de ${fmtCurrency(payload.installment_value)}`,
      `📅 1º vencimento: ${fmtDate(payload.first_due_date)}`,
      `👨‍💼 Responsável: ${assigneeName}`,
    ].join("\n");

    const apiUrl = Deno.env.get("WHATSAPP_API_URL");
    if (!apiUrl) {
      console.log("[charge-notify] WhatsApp não configurado. Mensagem:", message);
      return new Response(
        JSON.stringify({ ok: true, sent: false, reason: "not_configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: phoneSettings } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", `whatsapp_number_${payload.assigned_to}`)
      .single();

    if (phoneSettings?.value) {
      await fetch(`${apiUrl}/send-text`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Token": Deno.env.get("WHATSAPP_API_TOKEN") || "",
        },
        body: JSON.stringify({ phone: phoneSettings.value, message }),
      });
    }

    return new Response(
      JSON.stringify({ ok: true, sent: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[charge-notify]", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
