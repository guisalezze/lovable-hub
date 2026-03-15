import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PushSubscription {
  endpoint: string;
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
   * Converte PushSubscription para formato que pode ser salvo no Supabase
   */
  function subscriptionToObject(subscription: PushSubscription): {
    endpoint: string;
    p256dh: string;
    auth: string;
  } {
    const key = subscription.keys.p256dh;
    const auth = subscription.keys.auth;
    return {
      endpoint: subscription.endpoint,
      p256dh: key,
      auth: auth,
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

    try {
      // Solicitar permissão
      if (permission !== "granted") {
        const result = await Notification.requestPermission();
        setPermission(result);
        if (result !== "granted") {
          toast.error("Permissão de notificações negada.");
          setIsLoading(false);
          return;
        }
      }

      // Registrar service worker
      const registration = await navigator.serviceWorker.ready;

      // Verificar se VAPID key está configurada
      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        toast.error("Push notifications não estão configuradas. Contate o administrador.");
        setIsLoading(false);
        return;
      }

      // Criar subscription
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const subscriptionData = subscriptionToObject(subscription as unknown as PushSubscription);

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
        toast.error("Erro ao ativar notificações.");
        // Desfazer subscription se falhar ao salvar
        await subscription.unsubscribe();
      } else {
        setIsSubscribed(true);
        toast.success("Notificações push ativadas!");
      }
    } catch (error: any) {
      console.error("Erro ao registrar push:", error);
      if (error.name === "NotAllowedError") {
        toast.error("Permissão de notificações negada.");
      } else {
        toast.error("Erro ao ativar notificações push.");
      }
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
