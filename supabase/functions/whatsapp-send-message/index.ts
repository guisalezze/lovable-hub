import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://crm.guisalezze.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { to, template_name, template_language, template_params } = await req.json();

    if (!to || !template_name) {
      return new Response(JSON.stringify({ error: "Missing 'to' or 'template_name'" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch WhatsApp Cloud API config from app_settings
    const { data: config } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "whatsapp_cloud_config")
      .single();

    if (!config?.value) {
      return new Response(JSON.stringify({ error: "WhatsApp Cloud API não configurada" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { access_token, phone_number_id } = config.value as { access_token: string; phone_number_id: string };

    if (!access_token || !phone_number_id) {
      return new Response(JSON.stringify({ error: "WhatsApp config incompleta (token ou phone_number_id)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Format phone: remove +, spaces, dashes, parens
    const formattedPhone = to.replace(/[\s\-\+\(\)]/g, "");

    // Build template components
    const params = template_params || [];
    const components = params.length > 0
      ? [{
          type: "body",
          parameters: params.map((p: string) => ({ type: "text", text: p })),
        }]
      : [];

    // Call WhatsApp Cloud API
    const waResponse = await fetch(
      `https://graph.facebook.com/v21.0/${phone_number_id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: formattedPhone,
          type: "template",
          template: {
            name: template_name,
            language: { code: template_language || "pt_BR" },
            components,
          },
        }),
      }
    );

    const waData = await waResponse.json();

    if (!waResponse.ok) {
      return new Response(JSON.stringify({ error: "Falha ao enviar WhatsApp", details: waData }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messageId = waData.messages?.[0]?.id || null;

    return new Response(JSON.stringify({ success: true, whatsapp_message_id: messageId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
