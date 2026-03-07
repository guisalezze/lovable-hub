import { useState } from "react";
import { format, subDays } from "date-fns";
import { HeroMetrics } from "@/components/dashboard/HeroMetrics";
import { OperationalCards } from "@/components/dashboard/OperationalCards";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { SalesChart } from "@/components/dashboard/SalesChart";
import { RecentLeads } from "@/components/dashboard/RecentLeads";
import { PeriodSelector } from "@/components/dashboard/PeriodSelector";
import { InvestmentChart } from "@/components/dashboard/InvestmentChart";
import { CampaignTable } from "@/components/dashboard/CampaignTable";
import { OperationCards } from "@/components/dashboard/OperationCards";
import { useMetaSpend } from "@/hooks/useMetaSpend";
import { useMetaCampaigns } from "@/hooks/useMetaCampaigns";
import { useDashboardKpis, useDailyRevenue, useSalesByProduct, usePreviousPeriodKpis } from "@/hooks/useDashboardData";

const Dashboard = () => {
  const [since, setSince] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [until, setUntil] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: spendData, isLoading: spendLoading, error: spendError } = useMetaSpend({ since, until });
  const { data: campaignData, isLoading: campaignLoading, error: campaignError } = useMetaCampaigns({ since, until });
  const { data: kpis, isLoading: kpisLoading } = useDashboardKpis({ since, until });
  const { data: dailyRevenue, isLoading: revenueLoading } = useDailyRevenue({ since, until });
  const { data: salesByProduct, isLoading: productsLoading } = useSalesByProduct({ since, until });
  const { data: prevKpis } = usePreviousPeriodKpis({ since, until });

  const handlePeriodChange = (newSince: string, newUntil: string) => {
    setSince(newSince);
    setUntil(newUntil);
  };

  const revenue = kpis?.revenue || 0;
  const investment = spendData?.total_spend || 0;
  const profit = revenue - investment;
  const roas = investment > 0 ? (revenue / investment).toFixed(1) : "–";

  const isHeroLoading = kpisLoading || spendLoading;

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Visão geral da operação</p>
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

      {/* Zona 3 — Atividades do Dia */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Atividades do Dia</h2>
        <OperationCards />
      </div>

      {/* Gráficos (inalterados) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <InvestmentChart daily={spendData?.daily} isLoading={spendLoading} error={spendError} />
        <CampaignTable campaigns={campaignData?.campaigns} isLoading={campaignLoading} error={campaignError} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RevenueChart data={dailyRevenue} isLoading={revenueLoading} />
        <SalesChart data={salesByProduct} isLoading={productsLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RecentLeads />
        <div className="glass-card p-5 animate-fade-in">
          <h3 className="text-sm font-semibold text-foreground mb-4">Calls de Hoje</h3>
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            Nenhuma call agendada
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
