/**
 * Service Worker handlers para Push Notifications
 * Este código será injetado automaticamente no service worker pelo vite-plugin-pwa
 * via workbox.injectManifest ou será carregado dinamicamente
 */

// Handler para receber push notifications
self.addEventListener('push', (event) => {
  let data = {};
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: event.data.text() || 'Nova notificação' };
    }
  }

  const title = data.title || 'Solaryz';
  const options = {
    body: data.body || data.message || 'Você tem uma nova notificação',
    icon: data.icon || '/logo.png',
    badge: '/logo.png',
    image: data.image,
    data: data.data || {},
    tag: data.tag || 'default',
    requireInteraction: data.requireInteraction || false,
    vibrate: data.vibrate || [200, 100, 200],
    sound: data.sound || '/sounds/venda.mp3',
    actions: data.actions || [],
    timestamp: Date.now(),
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Handler para cliques em notificações
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data;
  const urlToOpen = data.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Se já existe uma janela aberta, focar nela
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // Caso contrário, abrir nova janela
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Handler para fechar notificações
self.addEventListener('notificationclose', (event) => {
  // Pode adicionar analytics aqui se necessário
  console.log('Notificação fechada:', event.notification.tag);
});
