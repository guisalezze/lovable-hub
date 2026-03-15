# PWA e Push Notifications - Guia

## ✅ O que foi implementado

### 1. Barra Inferior Fixa
- Barra de navegação inferior agora está fixa com `z-index: 100`
- Adicionado `backdrop-blur` para melhor visual
- Suporte para `safe-area-inset-bottom` (iPhone com notch)

### 2. Instalação do PWA
- Componente `PWAInstallPrompt` que aparece automaticamente
- Botão de instalação quando o navegador detecta que o app pode ser instalado
- Fallback com instruções manuais caso o prompt não apareça

## 📱 Como instalar no celular

### Android (Chrome)
1. Abra o site no Chrome
2. Aguarde o banner de instalação aparecer (ou toque no menu ⋮)
3. Toque em "Adicionar à tela inicial" ou "Instalar app"
4. O app será instalado como um app nativo

### iOS (Safari)
1. Abra o site no Safari
2. Toque no botão de compartilhar (quadrado com seta)
3. Role para baixo e toque em "Adicionar à Tela de Início"
4. O app será adicionado como um ícone na tela inicial

## 🔔 Push Notifications - Como funciona

### É gratuito?
**SIM!** Push notifications são **100% gratuitas** usando a Web Push API nativa do navegador.

### O que você precisa:

1. **Service Worker** (já configurado via VitePWA)
2. **Servidor para enviar notificações** (você pode usar):
   - **Supabase Edge Functions** (gratuito até certo limite)
   - **Firebase Cloud Messaging** (gratuito, 10k mensagens/dia)
   - **OneSignal** (gratuito até 10k usuários)
   - **Web Push Protocol** (gratuito, mas precisa de servidor próprio)

### Como implementar:

#### Opção 1: Supabase Edge Functions (Recomendado - já usa Supabase)
```typescript
// 1. Criar Edge Function para enviar notificações
// supabase/functions/send-push-notification/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  const { subscription, payload } = await req.json()
  
  // Enviar notificação usando Web Push
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `key=${VAPID_PUBLIC_KEY}`
    },
    body: JSON.stringify(payload)
  })
  
  return new Response(JSON.stringify({ success: true }))
})
```

#### Opção 2: Firebase Cloud Messaging (FCM) - Mais fácil
1. Criar projeto no Firebase (gratuito)
2. Obter chave do servidor
3. Configurar no frontend

#### Opção 3: OneSignal - Mais simples (recomendado para começar)
1. Criar conta gratuita em onesignal.com
2. Adicionar script no HTML
3. Configurar no código

### Exemplo de implementação básica:

```typescript
// src/hooks/usePushNotifications.ts
import { useEffect, useState } from "react";

export function usePushNotifications() {
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);
    registerServiceWorker();
  }, []);

  async function registerServiceWorker() {
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      setSubscription(sub);
    } catch (error) {
      console.error("Erro ao registrar service worker:", error);
    }
  }

  async function subscribe() {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: VAPID_PUBLIC_KEY, // Chave pública VAPID
      });

      // Enviar subscription para o servidor
      await fetch("/api/push-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription),
      });

      setSubscription(subscription);
    } catch (error) {
      console.error("Erro ao se inscrever:", error);
    }
  }

  return { subscription, isSupported, subscribe };
}
```

### Service Worker para receber notificações:

```javascript
// public/sw.js (será gerado pelo VitePWA)
self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  const title = data.title || "Nova notificação";
  const options = {
    body: data.body || "",
    icon: "/logo.png",
    badge: "/logo.png",
    data: data.url,
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data || "/")
  );
});
```

## 💰 Custos

| Serviço | Plano Gratuito | Limite |
|---------|---------------|--------|
| **Web Push API** | ✅ Gratuito | Ilimitado (precisa de servidor) |
| **Firebase FCM** | ✅ Gratuito | 10k mensagens/dia |
| **OneSignal** | ✅ Gratuito | 10k usuários |
| **Supabase Edge Functions** | ✅ Gratuito | 500k invocações/mês |

## 🚀 Próximos passos

1. **Decidir qual serviço usar** (recomendo OneSignal para começar)
2. **Implementar subscription** no frontend
3. **Criar endpoint** no backend para salvar subscriptions
4. **Configurar envio** de notificações quando necessário
5. **Testar** em dispositivos reais

## 📚 Recursos

- [Web Push Protocol](https://web.dev/push-notifications-overview/)
- [OneSignal Docs](https://documentation.onesignal.com/)
- [Firebase FCM](https://firebase.google.com/docs/cloud-messaging)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
