import { useProject } from "@/contexts/ProjectContext";

/**
 * Moeda de cada projeto. O Nutra opera em dólar (vendas da CartPanda/PerfectPay
 * gravadas em USD e conta do Meta em USD); os demais projetos operam em real.
 */
export type Currency = "BRL" | "USD";

export function currencyForProject(slug?: string | null): Currency {
  return slug === "nutra" ? "USD" : "BRL";
}

export function useProjectCurrency(): Currency {
  const { currentProject } = useProject();
  return currencyForProject(currentProject?.slug);
}

export const currencySymbol = (cur: Currency) => (cur === "USD" ? "US$" : "R$");

const formatters: Record<Currency, Intl.NumberFormat> = {
  BRL: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }),
  USD: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }),
};

/** R$ 1.234,56 ou US$ 1.234,56 */
export function formatMoney(v: number, cur: Currency = "BRL"): string {
  return formatters[cur].format(Number.isFinite(v) ? v : 0);
}

/** R$ 1,2K / US$ 3,4M — para espaços curtos */
export function formatMoneyShort(v: number, cur: Currency = "BRL"): string {
  const sym = currencySymbol(cur);
  if (Math.abs(v) >= 1_000_000) return `${sym} ${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  if (Math.abs(v) >= 1_000) return `${sym} ${(v / 1_000).toFixed(v % 1_000 === 0 ? 0 : 1)}K`;
  return `${sym} ${v.toFixed(0)}`;
}

/**
 * O gasto do Meta vem em dólar da conta e a função também devolve convertido
 * para real. Projeto em USD usa o valor original; projeto em BRL, o convertido.
 */
export function metaSpendIn(
  cur: Currency,
  d: { spend_brl?: string | number; spend_usd?: string | number; spend?: string | number },
): number {
  const raw = cur === "USD" ? (d.spend_usd ?? d.spend) : (d.spend_brl ?? d.spend ?? d.spend_usd);
  return Number(raw || 0);
}
