import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Tipagem auxiliar para o JSON da PushSubscription do browser
interface PushSubscriptionJSON {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * Hook para gerenciar notificações push nativas no PWA.
 * 
 * Funcionalidades:
 * - Solicita permissão do usuário
 * - Registra subscription no Supabase
 * - Remove subscription quando desativado
 */
export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);

  // Verificar suporte e permissão atual
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setIsSupported(false);
      setIsLoading(false);
      return;
    }

    setIsSupported(true);
    setPermission(Notification.permission);

    // Verificar se já está registrado
    checkSubscription();
  }, []);

  async function checkSubscription() {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (error) {
      console.error("Erro ao verificar subscription:", error);
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * Converte PushSubscription do browser para formato que pode ser salvo no Supabase.
   * Usa .toJSON() que retorna { endpoint, keys: { p256dh, auth } } como base64url strings.
   */
  function subscriptionToObject(subscription: globalThis.PushSubscription): {
    endpoint: string;
    p256dh: string;
    auth: string;
  } {
    const json = subscription.toJSON() as PushSubscriptionJSON;
    return {
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
    };
  }

  /**
   * Solicita permissão e registra subscription no Supabase
   */
  const subscribe = useCallback(async () => {
    if (!isSupported) {
      toast.error("Seu navegador não suporta notificações push.");
      return;
    }

    if (permission === "denied") {
      toast.error("Permissão de notificações foi negada. Ative nas configurações do navegador.");
      return;
    }

    setIsLoading(true);
    setLastError(null);

    try {
      // Solicitar permissão
      if (permission !== "granted") {
        const result = await Notification.requestPermission();
        setPermission(result);
        if (result !== "granted") {
          const msg = "Permissão de notificações negada pelo sistema.";
          setLastError(msg);
          toast.error(msg);
          setIsLoading(false);
          return;
        }
      }

      // Registrar service worker
      const registration = await navigator.serviceWorker.ready;

      // Verificar se VAPID key está configurada
      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        const msg = "Chave VAPID não configurada. Contate o administrador.";
        setLastError(msg);
        toast.error(msg);
        setIsLoading(false);
        return;
      }

      // Criar subscription
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });

      const subscriptionData = subscriptionToObject(subscription);

      // Salvar no Supabase
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Você precisa estar logado para ativar notificações.");
        setIsLoading(false);
        return;
      }

      const { error } = await supabase.from("push_subscriptions").upsert({
        user_id: user.id,
        endpoint: subscriptionData.endpoint,
        p256dh_key: subscriptionData.p256dh,
        auth_key: subscriptionData.auth,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "user_id",
      });

      if (error) {
        console.error("Erro ao salvar subscription:", error);
        const msg = `Erro ao salvar no servidor: ${error.message || JSON.stringify(error)}`;
        setLastError(msg);
        toast.error(msg);
        await subscription.unsubscribe();
      } else {
        setIsSubscribed(true);
        setLastError(null);
        toast.success("Notificações push ativadas!");
      }
    } catch (error: any) {
      console.error("Erro ao registrar push:", error);
      const msg = error.name === "NotAllowedError"
        ? "Permissão negada pelo sistema operacional."
        : `Erro: ${error.name} — ${error.message}`;
      setLastError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, permission]);

  /**
   * Remove subscription e desativa notificações
   */
  const unsubscribe = useCallback(async () => {
    setIsLoading(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
      }

      // Remover do Supabase
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("push_subscriptions").delete().eq("user_id", user.id);
      }

      setIsSubscribed(false);
      toast.success("Notificações push desativadas.");
    } catch (error) {
      console.error("Erro ao desativar push:", error);
      toast.error("Erro ao desativar notificações.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    lastError,
    subscribe,
    unsubscribe,
  };
}

/**
 * Converte VAPID public key (base64 URL) para Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
