import type { StylePatch } from "./types";

/** "auto" = cor de texto do tema (some e aparece nos temas claro e escuro). */
export const STROKE_COLORS = ["auto", "#e03131", "#f08c00", "#2f9e44", "#1971c2", "#9c36b5"];
/** "transparent" = sem preenchimento. */
export const FILL_COLORS = ["transparent", "#ffa8a8", "#ffd43b", "#8ce99a", "#74c0fc", "#da77f2"];
export const STROKE_WIDTHS = [2, 4, 7];
/** Tamanhos de texto (P, M, G, GG). */
export const FONT_SIZES = [16, 24, 36, 56];

export const COLOR_NAMES: Record<string, string> = {
  auto: "Automático (cor do tema)",
  transparent: "Sem preenchimento",
  "#e03131": "Vermelho",
  "#f08c00": "Laranja",
  "#2f9e44": "Verde",
  "#1971c2": "Azul",
  "#9c36b5": "Roxo",
  "#ffa8a8": "Vermelho claro",
  "#ffd43b": "Amarelo",
  "#8ce99a": "Verde claro",
  "#74c0fc": "Azul claro",
  "#da77f2": "Roxo claro",
};

export const DEFAULT_STYLE: Required<StylePatch> = {
  strokeColor: "auto",
  backgroundColor: "transparent",
  strokeWidth: 2,
  roundness: "round",
  fontSize: 24,
};
