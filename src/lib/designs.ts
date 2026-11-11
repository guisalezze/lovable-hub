import { useEffect, useState } from "react";

/**
 * Designs (temas visuais) do CRM.
 *
 * Cada design é um conjunto de variáveis CSS definido em `src/index.css`
 * sob `[data-design="<id>"]`. Para adicionar um novo:
 *   1. Adicione uma entrada aqui;
 *   2. Crie o bloco `[data-design="<id>"] { ... }` no index.css.
 * O id também é lido no index.html (script inline) para evitar "flash" ao abrir.
 */
export type DesignId = "vault" | "lima" | "violeta" | "claro" | "menta";

export interface DesignDef {
  id: DesignId;
  name: string;
  description: string;
  dark: boolean;
  /** Cores de prévia: [fundo, card, destaque] */
  swatch: [string, string, string];
  /** Cor da barra do navegador / status bar no PWA */
  themeColor: string;
}

export const DESIGNS: DesignDef[] = [
  {
    id: "vault",
    name: "Vault Ouro",
    description: "Preto com dourado (original)",
    dark: true,
    swatch: ["#0a0a0a", "#121212", "#d4a72c"],
    themeColor: "#0A0A0A",
  },
  {
    id: "lima",
    name: "Verde Lima",
    description: "Grafite esverdeado com destaques em lima",
    dark: true,
    swatch: ["#040505", "#111614", "#9be15d"],
    themeColor: "#040505",
  },
  {
    id: "violeta",
    name: "Violeta",
    description: "Roxo noturno com violeta e amarelo-lima",
    dark: true,
    swatch: ["#05040a", "#15101f", "#9d6bff"],
    themeColor: "#05040A",
  },
  {
    id: "claro",
    name: "Claro",
    description: "Fundo claro, limpo, com destaque esmeralda",
    dark: false,
    swatch: ["#f4f5f2", "#ffffff", "#16a34a"],
    themeColor: "#F4F5F2",
  },
  {
    id: "menta",
    name: "Menta",
    description: "Claro e suave, cinza-menta com verde-petróleo",
    dark: false,
    swatch: ["#ecf2f2", "#ffffff", "#5fdfa5"],
    themeColor: "#ECF2F2",
  },
];

const STORAGE_KEY = "vault-design";
const DEFAULT_DESIGN: DesignId = "vault";
const EVENT = "vault-design-change";

export function getStoredDesign(): DesignId {
  try {
    const v = localStorage.getItem(STORAGE_KEY) as DesignId | null;
    if (v && DESIGNS.some((d) => d.id === v)) return v;
  } catch {
    /* storage indisponível */
  }
  return DEFAULT_DESIGN;
}

export function applyDesign(id: DesignId) {
  const def = DESIGNS.find((d) => d.id === id) ?? DESIGNS[0];
  const root = document.documentElement;
  // Desliga transições durante a troca para não "piscar" elemento por elemento
  root.classList.add("design-switching");
  root.dataset.design = def.id;
  root.classList.toggle("dark", def.dark);
  root.style.colorScheme = def.dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", def.themeColor);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("design-switching")));
}

export function setDesign(id: DesignId) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  applyDesign(id);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: id }));
}

export function useDesign() {
  const [design, setLocal] = useState<DesignId>(() => getStoredDesign());

  useEffect(() => {
    const onChange = (e: Event) => setLocal((e as CustomEvent<DesignId>).detail);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  return { design, setDesign, designs: DESIGNS };
}
