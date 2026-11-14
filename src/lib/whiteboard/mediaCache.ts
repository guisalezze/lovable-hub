/** Onde os arquivos do quadro ficam guardados. O CRM usa o Supabase; a página de teste usa a memória. */
export interface MediaStore {
  /** Guarda o arquivo e devolve o id (caminho) que vai dentro do elemento. */
  upload(file: File): Promise<string>;
  /** Endereço temporário para ler o arquivo (imagem, áudio ou vídeo). */
  url(fileId: string): Promise<string>;
  remove(fileIds: string[]): Promise<void>;
}

type Entry = { url: string | null; image: HTMLImageElement | null; failed: boolean; loading: boolean };

const entries = new Map<string, Entry>();
let store: MediaStore | null = null;
let onUpdate: () => void = () => {};

export function setMediaStore(s: MediaStore | null): void {
  store = s;
  entries.clear();
}

export function setMediaUpdateListener(fn: () => void): () => void {
  onUpdate = fn;
  return () => {
    if (onUpdate === fn) onUpdate = () => {};
  };
}

/** Já tenho o endereço (ao subir um arquivo novo, evita pedir de novo). */
export function primeMedia(fileId: string, url: string, image?: HTMLImageElement): void {
  entries.set(fileId, { url, image: image ?? null, failed: false, loading: false });
}

function entryFor(fileId: string): Entry {
  let e = entries.get(fileId);
  if (!e) {
    e = { url: null, image: null, failed: false, loading: false };
    entries.set(fileId, e);
  }
  return e;
}

/** Imagem pronta para desenhar, ou null enquanto carrega (e dispara o carregamento). */
export function getImage(fileId: string): HTMLImageElement | null {
  const e = entryFor(fileId);
  if (e.image) return e.image;
  if (!e.loading && !e.failed && (store || e.url)) {
    e.loading = true;
    (e.url ? Promise.resolve(e.url) : store!.url(fileId))
      .then((url) => {
        e.url = url;
        return new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("imagem"));
          img.src = url;
        });
      })
      .then((img) => {
        e.image = img;
      })
      .catch(() => {
        e.failed = true;
      })
      .finally(() => {
        e.loading = false;
        onUpdate();
      });
  }
  return null;
}

export function isMediaFailed(fileId: string): boolean {
  return entries.get(fileId)?.failed ?? false;
}

/** Endereço para tocar um áudio/vídeo (ou null se não deu). */
export async function getMediaUrl(fileId: string): Promise<string | null> {
  const e = entryFor(fileId);
  if (e.url) return e.url;
  if (!store) return null;
  try {
    e.url = await store.url(fileId);
    return e.url;
  } catch {
    return null;
  }
}

/** Mede o arquivo antes de pôr no quadro (imagem: tamanho em pixels; vídeo: idem; áudio: nada). */
export async function measureFile(file: File): Promise<{ width: number; height: number } | null> {
  const url = URL.createObjectURL(file);
  try {
    if (file.type.startsWith("image/")) {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("imagem"));
        i.src = url;
      });
      return { width: img.naturalWidth || 1, height: img.naturalHeight || 1 };
    }
    if (file.type.startsWith("video/")) {
      return await new Promise((resolve) => {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.onloadedmetadata = () => resolve(v.videoWidth ? { width: v.videoWidth, height: v.videoHeight } : null);
        v.onerror = () => resolve(null);
        v.src = url;
      });
    }
    return null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Baixa as imagens usadas pelos elementos e devolve data URLs (para exportar SVG/PNG sem depender de endereços temporários). */
export async function collectImageData(elements: { type: string; fileId?: string }[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const ids = [...new Set(elements.filter((e) => e.type === "image" && e.fileId).map((e) => e.fileId as string))];
  await Promise.all(
    ids.map(async (id) => {
      const url = await getMediaUrl(id);
      if (!url) return;
      try {
        const blob = await (await fetch(url)).blob();
        out[id] = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = () => reject(r.error);
          r.readAsDataURL(blob);
        });
      } catch {
        /* sem a imagem: sai um quadro vazio no lugar */
      }
    }),
  );
  return out;
}
