import { useState } from "react";
import { format, subDays } from "date-fns";
import { Target, Pencil } from "lucide-react";
import { HeroMetrics } from "@/components/dashboard/HeroMetrics";
import { OperationalCards } from "@/components/dashboard/OperationalCards";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { SalesChart } from "@/components/dashboard/SalesChart";
import { RecentLeads } from "@/components/dashboard/RecentLeads";
import { PeriodSelector } from "@/components/dashboard/PeriodSelector";
import { InvestmentChart } from "@/components/dashboard/InvestmentChart";
import { CampaignTable } from "@/components/dashboard/CampaignTable";
import { OperationCards } from "@/components/dashboard/OperationCards";
import { ChargesHealthCard } from "@/components/dashboard/ChargesHealthCard";
import { LtvSummaryCard } from "@/components/dashboard/LtvSummaryCard";
import { useMetaSpend } from "@/hooks/useMetaSpend";
import { useMetaCampaigns } from "@/hooks/useMetaCampaigns";
import {
  useDashboardKpis,
  useDailyRevenue,
  useSalesByProduct,
  usePreviousPeriodKpis,
  useDashboardNutraKpis,
  useDailyNutraRevenue,
  useSalesByNutraProduct,
  usePreviousPeriodNutraKpis,
} from "@/hooks/useDashboardData";
import { useRevenueGoal, useSetRevenueGoal } from "@/hooks/useRevenueGoal";
import { useProject } from "@/contexts/ProjectContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const fmtBRL = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const Dashboard = () => {
  const { currentProject } = useProject();
  const isNutra = currentProject?.slug === "nutra";

  const [since, setSince] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [until, setUntil] = useState(format(new Date(), "yyyy-MM-dd"));

  // Meta Ads — compartilhado
  const { data: spendData, isLoading: spendLoading, error: spendError } = useMetaSpend({ since, until });
  const { data: campaignData, isLoading: campaignLoading, error: campaignError } = useMetaCampaigns({ since, until });

  // Educacional
  const { data: eduKpis, isLoading: eduKpisLoading } = useDashboardKpis({ since, until });
  const { data: eduDailyRevenue, isLoading: eduRevenueLoading } = useDailyRevenue({ since, until });
  const { data: eduSalesByProduct, isLoading: eduProductsLoading } = useSalesByProduct({ since, until });
  const { data: eduPrevKpis } = usePreviousPeriodKpis({ since, until });

  // Nutra
  const nutraProjectId = isNutra ? currentProject?.id : undefined;
  const { data: nutraKpis, isLoading: nutraKpisLoading } = useDashboardNutraKpis({ since, until, projectId: nutraProjectId });
  const { data: nutraDailyRevenue, isLoading: nutraRevenueLoading } = useDailyNutraRevenue({ since, until, projectId: nutraProjectId });
  const { data: nutraSalesByProduct, isLoading: nutraProductsLoading } = useSalesByNutraProduct({ since, until, projectId: nutraProjectId });
  const { data: nutraPrevKpis } = usePreviousPeriodNutraKpis({ since, until, projectId: nutraProjectId });

  // Seleciona fonte correta
  const kpis = isNutra ? nutraKpis : eduKpis;
  const kpisLoading = isNutra ? nutraKpisLoading : eduKpisLoading;
  const dailyRevenue = isNutra ? nutraDailyRevenue : eduDailyRevenue;
  const revenueLoading = isNutra ? nutraRevenueLoading : eduRevenueLoading;
  const salesByProduct = isNutra ? nutraSalesByProduct : eduSalesByProduct;
  const productsLoading = isNutra ? nutraProductsLoading : eduProductsLoading;
  const prevKpis = isNutra ? nutraPrevKpis : eduPrevKpis;

  const { data: revenueGoal = 0 } = useRevenueGoal();
  const setGoal = useSetRevenueGoal();
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState("");

  const handlePeriodChange = (newSince: string, newUntil: string) => {
    setSince(newSince);
    setUntil(newUntil);
  };

  const revenue = kpis?.revenue || 0;
  const investment = spendData?.total_spend || 0;
  const profit = revenue - investment;
  const roas = investment > 0 ? (revenue / investment).toFixed(1) : "–";

  const isHeroLoading = kpisLoading || spendLoading;

  const goalPct = revenueGoal > 0 ? Math.min(100, Math.round((revenue / revenueGoal) * 100)) : 0;
  const remaining = revenueGoal > 0 ? Math.max(0, revenueGoal - revenue) : 0;
  const goalBarColor = goalPct >= 100 ? "bg-emerald-500" : goalPct >= 70 ? "bg-primary" : goalPct >= 40 ? "bg-yellow-500" : "bg-destructive";

  return (
    <div className="space-y-4 sm:space-y-6 w-full max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <p className="eyebrow">{format(new Date(), "MMMM yyyy")}</p>
          <h1 className="text-xl sm:text-2xl font-display font-extrabold tracking-tight text-foreground">
            {currentProject?.icon} Dashboard · {currentProject?.name}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Visão geral da operação</p>
        </div>
        <PeriodSelector since={since} until={until} onChange={handlePeriodChange} />
      </div>

      {/* Zona 1 — Hero Metrics */}
      <HeroMetrics
        revenue={revenue}
        profit={profit}
        roas={roas}
        previousRevenue={prevKpis?.previousRevenue}
        investment={investment}
        isLoading={isHeroLoading}
      />

      {/* Revenue Goal Bar */}
      {revenueGoal > 0 || editingGoal ? (
        <div className="glass-card p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold text-foreground">Meta do Período</span>
              {!editingGoal && (
                <span className="text-xs text-muted-foreground">
                  {fmtBRL(revenue)} de {fmtBRL(revenueGoal)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {remaining > 0 && !editingGoal && (
                <span className="text-[10px] text-muted-foreground">Faltam {fmtBRL(remaining)}</span>
              )}
              {goalPct >= 100 && !editingGoal && (
                <Badge variant="secondary" className="text-[10px] bg-emerald-500/20 text-emerald-600">🎯 Meta batida!</Badge>
              )}
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => { setEditingGoal(true); setGoalInput(String(revenueGoal)); }}>
                <Pencil className="h-3 w-3" />
              </Button>
            </div>
          </div>
          {editingGoal ? (
            <div className="flex gap-2 items-center">
              <Input
                type="number"
                value={goalInput}
                onChange={e => setGoalInput(e.target.value)}
                placeholder="Meta de receita..."
                className="h-7 text-xs bg-secondary flex-1"
                autoFocus
              />
              <Button size="sm" className="h-7 text-xs" onClick={() => { setGoal.mutate(Number(goalInput)); setEditingGoal(false); }}>Salvar</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingGoal(false)}>Cancelar</Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2.5 bg-secondary rounded-full overflow-hidden">
                <div className={`h-full ${goalBarColor} rounded-full transition-all duration-500`} style={{ width: `${goalPct}%` }} />
              </div>
              <span className="text-xs font-bold text-foreground">{goalPct}%</span>
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setEditingGoal(true)}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Target className="h-3.5 w-3.5" />
          Definir meta de receita para o período
        </button>
      )}

      {/* Zona 2 — Operacional */}
      <OperationalCards
        investment={investment}
        investmentLabel={`${since} → ${until}`}
        approvedCount={kpis?.approvedCount || 0}
        pendingCount={kpis?.pendingCount || 0}
        refundCount={kpis?.refundCount || 0}
        chargebackCount={kpis?.chargebackCount || 0}
        isLoading={kpisLoading}
      />

      {/* Zona 3 — Atividades do Dia (apenas Educacional) */}
      {!isNutra && (
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Atividades do Dia</h2>
          <OperationCards />
        </div>
      )}

      {/* Gráficos — Meta Ads (compartilhado) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <InvestmentChart daily={spendData?.daily} isLoading={spendLoading} error={spendError} />
        <CampaignTable campaigns={campaignData?.campaigns} isLoading={campaignLoading} error={campaignError} />
      </div>

      {/* Gráficos — Receita e Produtos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RevenueChart data={dailyRevenue} isLoading={revenueLoading} />
        <SalesChart data={salesByProduct} isLoading={productsLoading} />
      </div>

      {/* Seções exclusivas do Educacional */}
      {!isNutra && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RecentLeads />
            <ChargesHealthCard />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <LtvSummaryCard />
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
