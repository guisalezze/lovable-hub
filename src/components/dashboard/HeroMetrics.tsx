import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface HeroMetricsProps {
  revenue: number;
  profit: number;
  roas: string;
  previousRevenue?: number;
  investment: number;
  isLoading: boolean;
}

const fmtBRL = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function calcChange(current: number, previous: number | undefined) {
  if (previous === undefined || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  return { pct: Math.round(pct * 10) / 10, type: pct >= 0 ? "positive" as const : "negative" as const };
}

function ChangeBadge({ change }: { change: ReturnType<typeof calcChange> }) {
  if (!change) return <Badge variant="outline" className="text-[10px] px-1.5 py-0">—</Badge>;
  const isPositive = change.type === "positive";
  const Icon = isPositive ? TrendingUp : TrendingDown;
  return (
    <Badge
      className={`text-[10px] px-1.5 py-0 gap-0.5 border-0 ${
        isPositive
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
      }`}
    >
      <Icon className="h-3 w-3" />
      {isPositive ? "+" : ""}{change.pct}%
    </Badge>
  );
}

function getRoasColor(roas: number) {
  if (roas >= 2) return { border: "border-l-emerald-500", bg: "from-card to-emerald-50/30 dark:to-emerald-950/10" };
  if (roas >= 1) return { border: "border-l-amber-500", bg: "from-card to-amber-50/30 dark:to-amber-950/10" };
  return { border: "border-l-red-500", bg: "from-card to-red-50/30 dark:to-red-950/10" };
}

export function HeroMetrics({ revenue, profit, roas, previousRevenue, investment, isLoading }: HeroMetricsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-[140px] rounded-xl" />)}
      </div>
    );
  }

  const revenueChange = calcChange(revenue, previousRevenue);
  const profitPrevious = previousRevenue !== undefined ? previousRevenue - investment : undefined;
  const profitChange = calcChange(profit, profitPrevious);
  const roasNum = parseFloat(roas) || 0;
  const roasStyle = getRoasColor(roasNum);

  const previousRoas = previousRevenue !== undefined && investment > 0 ? previousRevenue / investment : undefined;
  const roasChange = calcChange(roasNum, previousRoas);

  const cards = [
    {
      label: "RECEITA TOTAL",
      value: fmtBRL(revenue),
      change: revenueChange,
      border: revenue >= 0 ? "border-l-emerald-500" : "border-l-red-500",
      bg: "from-card to-emerald-50/30 dark:to-emerald-950/10",
    },
    {
      label: "LUCRO LÍQUIDO",
      value: fmtBRL(profit),
      change: profitChange,
      subtitle: "Receita − Investimento",
      border: profit >= 0 ? "border-l-emerald-500" : "border-l-red-500",
      bg: profit >= 0 ? "from-card to-emerald-50/30 dark:to-emerald-950/10" : "from-card to-red-50/30 dark:to-red-950/10",
    },
    {
      label: "ROAS",
      value: roas !== "–" ? `${roas}x` : "–",
      change: roasChange,
      subtitle: "Receita ÷ Investimento",
      border: roasStyle.border,
      bg: roasStyle.bg,
    },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-xl border border-border border-l-4 ${card.border} bg-gradient-to-br ${card.bg} p-6 shadow-sm hover:shadow-md transition-shadow`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold text-muted-foreground tracking-wider">{card.label}</span>
            <ChangeBadge change={card.change} />
          </div>
          <p className="text-3xl font-bold text-foreground">{card.value}</p>
          {card.subtitle && (
            <p className="text-[11px] text-muted-foreground mt-2">{card.subtitle}</p>
          )}
        </div>
      ))}
    </div>
  );
}
