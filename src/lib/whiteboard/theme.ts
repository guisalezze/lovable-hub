export interface ThemeColors {
  background: string;
  foreground: string;
  grid: string;
  selection: string;
}

// Tokens do CRM (shadcn): valores em HSL sem o hsl(), ex. "0 0% 4%".
const TOKENS: Record<keyof ThemeColors, { name: string; fallback: string }> = {
  background: { name: "--background", fallback: "0 0% 4%" },
  foreground: { name: "--foreground", fallback: "60 20% 95%" },
  grid: { name: "--border", fallback: "0 0% 15%" },
  selection: { name: "--primary", fallback: "46 65% 52%" },
};

export function readThemeColors(el: HTMLElement = document.documentElement): ThemeColors {
  const cs = getComputedStyle(el);
  const read = (key: keyof ThemeColors) => {
    const { name, fallback } = TOKENS[key];
    const raw = cs.getPropertyValue(name).trim() || el.style.getPropertyValue(name).trim();
    return `hsl(${raw || fallback})`;
  };
  return {
    background: read("background"),
    foreground: read("foreground"),
    grid: read("grid"),
    selection: read("selection"),
  };
}

/** "auto" é a cor de texto do tema; qualquer outra cor passa direto. */
export function resolveColor(color: string, theme: ThemeColors): string {
  return color === "auto" ? theme.foreground : color;
}
