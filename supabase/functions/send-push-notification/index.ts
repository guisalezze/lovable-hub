import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @deno-types="https://esm.sh/@types/web-push@3.6.4/index.d.ts"
import webpush from "https://esm.sh/web-push@4.0.0";

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
 * Converte chave base64url para Buffer (formato esperado pelo web-push)
 */
function base64UrlToBuffer(base64url: string): Uint8Array {
  // Adicionar padding se necessário
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  
  // Converter base64 para bytes
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Envia notificação push usando Web Push Protocol com web-push library
 */
async function sendPushNotification(
  subscription: PushSubscription,
  payload: { title: string; body: string; icon?: string; data?: any; tag?: string }
) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    throw new Error("VAPID keys não configuradas. Configure VITE_VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY no Supabase.");
  }

  // Converter subscription para formato esperado pelo web-push
  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: base64UrlToBuffer(subscription.p256dh_key),
      auth: base64UrlToBuffer(subscription.auth_key),
    },
  };

  // Criar payload JSON
  const notificationPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || "/logo.png",
    badge: "/logo.png",
    data: payload.data || {},
    tag: payload.tag || "default",
  });

  // Configurar VAPID details
  const vapidDetails = {
    subject: "mailto:support@solaryz.com", // Pode ser qualquer email válido
    publicKey: VAPID_PUBLIC_KEY,
    privateKey: VAPID_PRIVATE_KEY,
  };

  try {
    // Enviar notificação usando web-push
    await webpush.sendNotification(pushSubscription, notificationPayload, {
      vapidDetails,
    });

    console.log(`[send-push-notification] Notificação enviada com sucesso para ${subscription.endpoint}`);
    return { success: true };
  } catch (error: any) {
    console.error(`[send-push-notification] Erro ao enviar:`, error);
    
    // Verificar se é erro de subscription inválida
    if (error.statusCode === 410 || error.statusCode === 404 || error.message?.includes("Gone")) {
      throw new Error("SUBSCRIPTION_INVALID");
    }
    
    throw error;
  }
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

    // Verificar se VAPID keys estão configuradas
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return new Response(
        JSON.stringify({ 
          error: "VAPID keys não configuradas", 
          details: "Configure VITE_VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY no Supabase Secrets" 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
      console.error(`[send-push-notification] Subscription não encontrada para userId: ${userId}`, subError);
      return new Response(
        JSON.stringify({ error: "Subscription não encontrada", details: subError?.message }),
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
      console.error(`[send-push-notification] Erro ao enviar push:`, pushError);
      
      // Se a subscription é inválida, remover do banco
      if (pushError.message === "SUBSCRIPTION_INVALID" || pushError.message?.includes("410") || pushError.message?.includes("Gone")) {
        await supabaseClient
          .from("push_subscriptions")
          .delete()
          .eq("user_id", userId);
        
        return new Response(
          JSON.stringify({ 
            error: "Subscription inválida e removida", 
            details: "A subscription foi removida. O usuário precisa reativar as notificações." 
          }),
          { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ 
          error: "Erro ao enviar push", 
          details: pushError.message || String(pushError),
          statusCode: pushError.statusCode 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: any) {
    console.error(`[send-push-notification] Erro geral:`, error);
    return new Response(
      JSON.stringify({ error: error.message || String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
