/** Quantas cores favoritas o quadro guarda. */
export const FAVORITES_LIMIT = 12;

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** "#ABC" / "#FFD43B" → "#aabbcc" / "#ffd43b". Qualquer outra coisa → null. */
export function normalizeHex(color: string): string | null {
  const c = color.trim();
  if (!HEX.test(c)) return null;
  const hex = c.slice(1).toLowerCase();
  return `#${hex.length === 3 ? hex.split("").map((ch) => ch + ch).join("") : hex}`;
}

export const isHexColor = (color: string): boolean => normalizeHex(color) !== null;

/** Põe a cor no começo da lista (sem repetir) e corta no limite. Cor inválida: devolve a mesma lista. */
export function addFavorite(list: string[], color: string): string[] {
  const hex = normalizeHex(color);
  if (!hex) return list;
  return [hex, ...list.filter((c) => c !== hex)].slice(0, FAVORITES_LIMIT);
}

export function removeFavorite(list: string[], color: string): string[] {
  return list.includes(color) ? list.filter((c) => c !== color) : list;
}

/** Lê o que está guardado no navegador, sem confiar nele: só cores hexadecimais válidas, sem repetir. */
export function parseFavorites(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const out: string[] = [];
    for (const item of data) {
      const hex = typeof item === "string" ? normalizeHex(item) : null;
      if (hex && !out.includes(hex)) out.push(hex);
    }
    return out.slice(0, FAVORITES_LIMIT);
  } catch {
    return [];
  }
}
