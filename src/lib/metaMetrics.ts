// src/lib/metaMetrics.ts

/** Unified shape every level (campaign/adset/ad) normalizes into before rendering. */
export interface MetricRow {
  id: string;            // internal UUID (meta_campaigns.id / meta_adsets.id / meta_ads.id)
  graphId: string;       // Meta's own text ID — what pause/resume/budget actions target
  name: string | null;
  status: string | null;
  date: string;
  adsetName?: string | null;    // only meaningful at adset/ad level
  campaignName?: string | null; // only meaningful at ad level
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;          // sale-linked count, from ad_performance / the rollup views — NOT Meta's own pixel count
  initiate_checkout: number;
  video_view: number;
  video_plays: number;
  video_p75_watched: number;
  follows: number;
  revenue: number | null;
  cpa: number | null;
  roas: number | null;
  profit: number | null;
  bid_amount: number | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
}

export type MetricFormat = "currency" | "number" | "percent" | "multiplier";
export type MetricGroup = "basico" | "funil" | "video" | "social";

export interface MetricDef {
  id: string;
  label: string;
  group: MetricGroup;
  format: MetricFormat;
  compute: (row: MetricRow) => number | null;
}

function div(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

export const METRIC_CATALOG: MetricDef[] = [
  { id: "spend", label: "Gasto", group: "basico", format: "currency", compute: (r) => r.spend },
  { id: "impressions", label: "Impressões", group: "basico", format: "number", compute: (r) => r.impressions },
  { id: "clicks", label: "Cliques", group: "basico", format: "number", compute: (r) => r.clicks },
  { id: "ctr", label: "CTR", group: "basico", format: "percent", compute: (r) => { const v = div(r.clicks, r.impressions); return v == null ? null : v * 100; } },
  { id: "cpm", label: "CPM", group: "basico", format: "currency", compute: (r) => { const v = div(r.spend, r.impressions); return v == null ? null : v * 1000; } },
  { id: "cpc", label: "CPC", group: "basico", format: "currency", compute: (r) => div(r.spend, r.clicks) },
  { id: "conversions", label: "Conv.", group: "basico", format: "number", compute: (r) => r.conversions },
  { id: "cpa", label: "CPA", group: "basico", format: "currency", compute: (r) => r.cpa },
  { id: "revenue", label: "Faturamento", group: "basico", format: "currency", compute: (r) => r.revenue },
  { id: "profit", label: "Lucro", group: "basico", format: "currency", compute: (r) => r.profit },
  { id: "roas", label: "ROAS", group: "basico", format: "multiplier", compute: (r) => r.roas },
  { id: "initiate_checkout", label: "IC (Finalização iniciada)", group: "funil", format: "number", compute: (r) => r.initiate_checkout },
  { id: "cpi", label: "CPI (Custo por IC)", group: "funil", format: "currency", compute: (r) => div(r.spend, r.initiate_checkout) },
  { id: "hook_rate", label: "Hook Rate", group: "video", format: "percent", compute: (r) => { const v = div(r.video_view, r.impressions); return v == null ? null : v * 100; } },
  { id: "play_rate", label: "Play Rate", group: "video", format: "percent", compute: (r) => { const v = div(r.video_plays, r.impressions); return v == null ? null : v * 100; } },
  { id: "hold_rate", label: "Hold Rate", group: "video", format: "percent", compute: (r) => { const v = div(r.video_p75_watched, r.impressions); return v == null ? null : v * 100; } },
  { id: "body_retention", label: "Retenção do Body", group: "video", format: "percent", compute: (r) => { const v = div(r.video_p75_watched, r.video_plays); return v == null ? null : v * 100; } },
  { id: "body_conversion", label: "Conversão do Body", group: "video", format: "percent", compute: (r) => { const v = div(r.conversions, r.video_p75_watched); return v == null ? null : v * 100; } },
  { id: "cost_per_follow", label: "Custo/Seguidor", group: "social", format: "currency", compute: (r) => div(r.spend, r.follows) },
  { id: "bid_amount", label: "Bid Cap", group: "social", format: "currency", compute: (r) => r.bid_amount },
];

export const METRIC_GROUPS: Record<MetricGroup, string> = {
  basico: "Básico",
  funil: "Funil",
  video: "Vídeo",
  social: "Social / Config",
};

export const DEFAULT_VISIBLE_METRICS = ["spend", "clicks", "conversions", "cpa", "roas"];

export function formatMetricValue(value: number | null, format: MetricFormat): string {
  if (value == null || Number.isNaN(value)) return "–";
  switch (format) {
    case "currency":
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
    case "percent":
      return `${value.toFixed(2)}%`;
    case "multiplier":
      return `${value.toFixed(2)}x`;
    default:
      return value.toLocaleString("pt-BR");
  }
}
