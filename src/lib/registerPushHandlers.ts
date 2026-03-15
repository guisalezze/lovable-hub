/**
 * Registra handlers de push notifications no service worker
 * Chamado quando o service worker é instalado
 */
export async function registerPushHandlers() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    
    // Os handlers de push serão registrados automaticamente pelo service worker
    // quando ele receber eventos 'push'. Não precisamos fazer nada aqui,
    // apenas garantir que o service worker está registrado.
    
    // Verificar se o service worker tem suporte a push
    if (!("PushManager" in window)) {
      console.warn("Push notifications não são suportadas neste navegador");
      return;
    }

    console.log("Service worker pronto para push notifications");
  } catch (error) {
    console.error("Erro ao registrar handlers de push:", error);
  }
}
