// Troca para a versão nova do app depois de um deploy, sem atrapalhar o uso.
//
// O service worker novo assume assim que é baixado (src/sw.ts). A página aberta,
// porém, ainda roda o código antigo. Ela recarrega para a versão nova:
// - no próximo clique de menu (troca de página), ou
// - quando a aba/app vai para segundo plano.
// Nunca no meio de um formulário que está sendo preenchido.

let updateReady = false;

function checkForUpdate() {
  navigator.serviceWorker
    .getRegistration()
    .then((reg) => reg?.update())
    .catch(() => {});
}

export function initAppUpdates() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  // Na primeira instalação também há controllerchange, mas não há o que atualizar
  const hadController = !!navigator.serviceWorker.controller;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) return;
    updateReady = true;
    if (document.visibilityState === "hidden") window.location.reload();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (updateReady) window.location.reload();
    } else {
      // Voltou para o app: confere se saiu versão nova
      checkForUpdate();
    }
  });

  // App aberto o dia todo (PWA): confere a cada 30 min
  setInterval(checkForUpdate, 30 * 60_000);
}

/** Chamado a cada troca de página. Retorna true se vai recarregar. */
export function reloadIfUpdateReady() {
  if (!updateReady) return false;
  window.location.reload();
  return true;
}
