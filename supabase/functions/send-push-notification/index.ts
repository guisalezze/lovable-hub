import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY = Deno.env.get("VITE_VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";

// Headers CORS obrigatórios para chamadas do browser
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PushSubscription {
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
}

/**
 * Envia notificação push usando Web Push Protocol
 */
async function sendPushNotification(
  subscription: PushSubscription,
  payload: { title: string; body: string; icon?: string; data?: any }
) {
  const vapidHeaders = await createVapidHeaders(
    subscription.endpoint,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );

  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      ...vapidHeaders,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || "/logo.png",
      badge: "/logo.png",
      data: payload.data || {},
      tag: payload.tag || "default",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Push failed: ${response.status} ${text}`);
  }

  return response;
}

/**
 * Cria headers VAPID para autenticação com o push service
 */
async function createVapidHeaders(
  endpoint: string,
  publicKey: string,
  privateKey: string
): Promise<Record<string, string>> {
  // Para simplificar, vamos usar uma biblioteca ou implementação básica
  // Em produção, use uma biblioteca como 'web-push' do npm
  // Por enquanto, retornamos headers básicos
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;

  // Nota: Implementação completa de VAPID requer criptografia JWT
  // Por enquanto, retornamos estrutura básica
  // Em produção, use: npm install web-push e adapte para Deno
  return {
    Authorization: `vapid t=${Date.now()}, k=${publicKey}`,
  };
}

serve(async (req) => {
  // Responder ao preflight OPTIONS do CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId, title, body, icon, data, tag } = await req.json();

    if (!userId || !title || !body) {
      return new Response(
        JSON.stringify({ error: "userId, title e body são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Criar cliente Supabase
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Buscar subscription do usuário
    const { data: subscription, error: subError } = await supabaseClient
      .from("push_subscriptions")
      .select("endpoint, p256dh_key, auth_key")
      .eq("user_id", userId)
      .single();

    if (subError || !subscription) {
      return new Response(
        JSON.stringify({ error: "Subscription não encontrada", details: subError }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Enviar notificação
    try {
      await sendPushNotification(subscription, {
        title,
        body,
        icon,
        data,
        tag,
      });

      return new Response(
        JSON.stringify({ success: true, message: "Notificação enviada" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (pushError: any) {
      // Se a subscription é inválida, remover do banco
      if (pushError.message?.includes("410") || pushError.message?.includes("Gone")) {
        await supabaseClient
          .from("push_subscriptions")
          .delete()
          .eq("user_id", userId);
      }

      return new Response(
        JSON.stringify({ error: "Erro ao enviar push", details: pushError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
