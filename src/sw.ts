/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope;

// ── Precache todos os assets gerados pelo Vite ──────────────────────────────
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ── Fallback de navegação (SPA) ─────────────────────────────────────────────
const handler = createHandlerBoundToURL('/index.html');
registerRoute(
  new NavigationRoute(handler, {
    denylist: [/^\/api\//, /^\/functions\//, /^\/supabase\//],
  })
);

// ── Cache da API do Supabase ────────────────────────────────────────────────
registerRoute(
  ({ url }) => url.hostname.includes('supabase.co'),
  new NetworkFirst({
    cacheName: 'supabase-api-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// ── Cache de storage do Supabase ────────────────────────────────────────────
registerRoute(
  ({ url }) => url.hostname.includes('supabase') && url.pathname.includes('/storage/'),
  new CacheFirst({
    cacheName: 'supabase-storage-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 }),
    ],
  })
);

// ══════════════════════════════════════════════════════════════════════════════
// PUSH NOTIFICATION HANDLERS
// ══════════════════════════════════════════════════════════════════════════════

self.addEventListener('push', (event) => {
  console.log('[SW] Push event recebido', event);
  
  let data: Record<string, any> = {};

  if (event.data) {
    try {
      // Tentar processar como JSON (formato padrão do web-push)
      data = event.data.json();
      console.log('[SW] Payload processado como JSON:', data);
    } catch (jsonError) {
      try {
        // Se falhar, tentar como texto
        const text = event.data.text();
        console.log('[SW] Payload processado como texto:', text);
        data = { title: text || 'Nova notificação' };
      } catch (textError) {
        // Se falhar tudo, usar dados padrão
        console.warn('[SW] Erro ao processar payload:', jsonError, textError);
        data = { title: 'Nova notificação' };
      }
    }
  } else {
    console.warn('[SW] Push event sem dados');
    data = { title: 'Nova notificação' };
  }

  const title = (data.title as string) || 'Solaryz';
  const options: NotificationOptions = {
    body: (data.body as string) || 'Você tem uma nova notificação',
    icon: (data.icon as string) || '/logo.png',
    badge: '/logo.png',
    data: data.data || {},
    tag: (data.tag as string) || 'default',
    requireInteraction: false,
    // @ts-ignore vibrate is supported in browsers
    vibrate: [200, 100, 200],
  };

  console.log('[SW] Exibindo notificação:', title, options);

  event.waitUntil(
    self.registration.showNotification(title, options).then(() => {
      console.log('[SW] Notificação exibida com sucesso');
    }).catch((error) => {
      console.error('[SW] Erro ao exibir notificação:', error);
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notifData = event.notification.data as { url?: string } | undefined;
  const urlToOpen = notifData?.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            (client as WindowClient).navigate(urlToOpen);
            return client.focus();
          }
        }
        return self.clients.openWindow(urlToOpen);
      })
  );
});
