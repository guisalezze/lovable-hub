import { Wallet, ShoppingCart, Clock, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface OperationalCardsProps {
  investment: number;
  investmentLabel: string;
  approvedCount: number;
  pendingCount: number;
  refundCount: number;
  chargebackCount: number;
  isLoading: boolean;
}

const fmtBRL = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function OperationalCards({
  investment,
  investmentLabel,
  approvedCount,
  pendingCount,
  refundCount,
  chargebackCount,
  isLoading,
}: OperationalCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[100px] rounded-xl" />)}
      </div>
    );
  }

  const totalSales = approvedCount + pendingCount + refundCount + chargebackCount;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Investimento */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-muted-foreground tracking-wider">INVESTIMENTO (META ADS)</span>
          <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
            <Wallet className="h-3.5 w-3.5 text-primary" />
          </div>
        </div>
        <p className="text-xl font-bold text-foreground">{fmtBRL(investment)}</p>
        <p className="text-[10px] text-muted-foreground mt-1">{investmentLabel}</p>
      </div>

      {/* Vendas Aprovadas */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-muted-foreground tracking-wider">VENDAS APROVADAS</span>
          <div className="h-7 w-7 rounded-md bg-emerald-500/10 flex items-center justify-center">
            <ShoppingCart className="h-3.5 w-3.5 text-emerald-600" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <p className="text-xl font-bold text-foreground">{approvedCount}</p>
          <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[9px] px-1.5 py-0">approved</Badge>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">de {totalSales} total</p>
      </div>

      {/* Pendentes */}
      <div className={`glass-card p-4 ${pendingCount > 5 ? "border-amber-400/50 border" : ""}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-muted-foreground tracking-wider">PENDENTES</span>
          <div className="h-7 w-7 rounded-md bg-amber-500/10 flex items-center justify-center">
            <Clock className="h-3.5 w-3.5 text-amber-600" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <p className="text-xl font-bold text-foreground">{pendingCount}</p>
          <Badge className="bg-amber-100 text-amber-700 border-0 text-[9px] px-1.5 py-0">pending</Badge>
        </div>
      </div>

      {/* Refunds + Chargebacks */}
      <div className={`glass-card p-4 ${chargebackCount > 0 ? "border-red-400/50 border" : ""}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-muted-foreground tracking-wider">REFUNDS + CHARGEBACKS</span>
          <div className={`h-7 w-7 rounded-md flex items-center justify-center ${chargebackCount > 0 ? "bg-red-500/10" : "bg-muted"}`}>
            <AlertTriangle className={`h-3.5 w-3.5 ${chargebackCount > 0 ? "text-red-600" : "text-muted-foreground"}`} />
          </div>
        </div>
        <p className="text-xl font-bold text-foreground">{refundCount + chargebackCount}</p>
        <p className="text-[10px] text-muted-foreground mt-1">
          {refundCount} refunds · {chargebackCount} chargebacks
        </p>
      </div>
    </div>
  );
}
