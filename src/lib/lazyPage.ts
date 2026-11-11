import { lazy, type ComponentType } from "react";

// Carregamento sob demanda das páginas.
// Cada página vira um arquivo JS separado: o app abre baixando só o necessário.
// Depois que o CRM abre, preloadPages() baixa as demais em segundo plano,
// então trocar de página continua instantâneo.

type Loader = () => Promise<{ default: ComponentType<any> }>;

const loaders: Loader[] = [];
const RELOAD_KEY = "lazy-page-reload-at";

function isChunkError(err: unknown) {
  const msg = String((err as Error)?.message ?? err);
  return /dynamically imported module|Importing a module script failed|Failed to fetch|Loading chunk/i.test(msg);
}

export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  loaders.push(load);
  return lazy(() =>
    load().catch((err) => {
      // Depois de um deploy novo, os arquivos antigos deixam de existir.
      // Recarrega a página uma vez para pegar a versão nova.
      if (isChunkError(err)) {
        let last = 0;
        try { last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0); } catch { /* ignora */ }
        if (Date.now() - last > 10_000) {
          try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* ignora */ }
          window.location.reload();
          return new Promise<{ default: T }>(() => {});
        }
      }
      throw err;
    })
  );
}

let preloaded = false;

export function preloadPages() {
  if (preloaded) return;
  preloaded = true;
  const idle: (cb: () => void) => void =
    "requestIdleCallback" in window
      ? (cb) => (window as any).requestIdleCallback(cb, { timeout: 3000 })
      : (cb) => setTimeout(cb, 1500);

  // Um por vez, nos momentos ociosos, para não disputar rede com os dados da tela atual
  const queue = [...loaders];
  const next = () => {
    const load = queue.shift();
    if (!load) return;
    load().catch(() => {}).finally(() => idle(next));
  };
  idle(next);
}
