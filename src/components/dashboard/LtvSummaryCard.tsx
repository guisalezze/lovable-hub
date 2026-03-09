import { Crown, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientLtvKpis } from "@/hooks/useClientLtv";
import { LtvBadge } from "@/components/shared/LtvBadge";
import { useNavigate } from "react-router-dom";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export function LtvSummaryCard() {
  const { data, isLoading } = useClientLtvKpis();
  const navigate = useNavigate();

  if (isLoading) return <Skeleton className="h-64 rounded-lg" />;

  if (!data || data.totalClients === 0) {
    return (
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Crown className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-foreground">Top Clientes (LTV)</h3>
        </div>
        <p className="text-sm text-muted-foreground text-center py-6">Sem dados de clientes</p>
      </div>
    );
  }

  return (
    <div
      className="glass-card p-5 cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => navigate("/clientes")}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Crown className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-foreground">Top Clientes (LTV)</h3>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{data.vipCount} VIP</span>
          <span>{data.premiumCount} Premium</span>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4 text-xs">
        <div>
          <span className="text-muted-foreground">Ticket médio</span>
          <p className="font-bold text-foreground">{fmtBRL(data.avgLtv)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">LTV total</span>
          <p className="font-bold text-foreground">{fmtBRL(data.totalLtv)}</p>
        </div>
      </div>

      <div className="space-y-2">
        {data.topClients.map((c, i) => (
          <div key={c.email} className="flex items-center justify-between py-1.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-[11px] font-mono text-muted-foreground w-4">{i + 1}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {c.name || c.email}
                </p>
                {c.name && (
                  <p className="text-[10px] text-muted-foreground truncate">{c.email}</p>
                )}
              </div>
            </div>
            <LtvBadge segment={c.segment} ltv={c.ltv} size="sm" />
          </div>
        ))}
      </div>
    </div>
  );
}
