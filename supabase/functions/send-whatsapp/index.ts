const corsHeaders = {
  "Access-Control-Allow-Origin": "https://crm.guisalezze.com",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { nomeCliente, telefoneCliente, mensagem } = await req.json();

    if (!telefoneCliente || !mensagem) {
      return new Response(
        JSON.stringify({ error: "Missing telefoneCliente or mensagem" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const webhookUrl = "https://hook.neowchat.com.br/webhook/4444916b-60aa-4868-81d3-f120412682";

    const payload = {
      body: {
        "Nome do Cliente": nomeCliente || "Cliente",
        "Telefone do Cliente": telefoneCliente,
        "Mensagem": mensagem,
      },
      webhookUrl: "https://hook.neowchat.com.br/webhook/disparos",
      executionMode: "production",
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(
        JSON.stringify({ error: "Webhook failed", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
