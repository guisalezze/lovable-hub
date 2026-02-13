import { useState } from "react";
import {
  DollarSign,
  TrendingUp,
  ShoppingCart,
  Clock,
  RotateCcw,
  AlertTriangle,
  Target,
  Wallet,
} from "lucide-react";
import { format, subDays } from "date-fns";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { SalesChart } from "@/components/dashboard/SalesChart";
import { RecentLeads } from "@/components/dashboard/RecentLeads";
import { PeriodSelector } from "@/components/dashboard/PeriodSelector";
import { InvestmentChart } from "@/components/dashboard/InvestmentChart";
import { CampaignTable } from "@/components/dashboard/CampaignTable";
import { useMetaSpend } from "@/hooks/useMetaSpend";
import { useMetaCampaigns } from "@/hooks/useMetaCampaigns";
import { Skeleton } from "@/components/ui/skeleton";

const Dashboard = () => {
  const [since, setSince] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [until, setUntil] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: spendData, isLoading: spendLoading, error: spendError } = useMetaSpend({ since, until });
  const { data: campaignData, isLoading: campaignLoading, error: campaignError } = useMetaCampaigns({ since, until });

  const handlePeriodChange = (newSince: string, newUntil: string) => {
    setSince(newSince);
    setUntil(newUntil);
  };

  const investmentValue = spendData
    ? `R$ ${spendData.total_spend.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
    : undefined;

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Visão geral da operação</p>
        </div>
        <PeriodSelector since={since} until={until} onChange={handlePeriodChange} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Receita Total"
          value="R$ 84.200"
          change="+12.5% vs mês anterior"
          changeType="positive"
          icon={DollarSign}
        />
        <KpiCard
          label="Lucro"
          value="R$ 52.800"
          change="+8.2% vs mês anterior"
          changeType="positive"
          icon={TrendingUp}
        />
        <KpiCard
          label="ROAS"
          value="3.8x"
          change="+0.4 vs mês anterior"
          changeType="positive"
          icon={Target}
        />
        {spendLoading ? (
          <div className="glass-card p-5 animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
            <Skeleton className="h-7 w-28" />
          </div>
        ) : (
          <KpiCard
            label="Investimento (Meta Ads)"
            value={investmentValue || "–"}
            change={`${since} → ${until}`}
            changeType="neutral"
            icon={Wallet}
          />
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Vendas Aprovadas" value="132" icon={ShoppingCart} />
        <KpiCard label="Pendentes" value="28" icon={Clock} />
        <KpiCard label="Refunds" value="7" change="-2 vs semana passada" changeType="positive" icon={RotateCcw} />
        <KpiCard label="Chargebacks" value="2" icon={AlertTriangle} />
      </div>

      {/* Investment section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <InvestmentChart
          daily={spendData?.daily}
          isLoading={spendLoading}
          error={spendError}
        />
        <CampaignTable
          campaigns={campaignData?.campaigns}
          isLoading={campaignLoading}
          error={campaignError}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RevenueChart />
        <SalesChart />
      </div>

      {/* Bottom section */}
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
