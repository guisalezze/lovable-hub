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
import { KpiCard } from "@/components/dashboard/KpiCard";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { SalesChart } from "@/components/dashboard/SalesChart";
import { RecentLeads } from "@/components/dashboard/RecentLeads";

const Dashboard = () => {
  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Visão geral da operação</p>
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
        <KpiCard
          label="Investimento"
          value="R$ 22.100"
          change="Meta Ads + Google"
          changeType="neutral"
          icon={Wallet}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Vendas Aprovadas" value="132" icon={ShoppingCart} />
        <KpiCard label="Pendentes" value="28" icon={Clock} />
        <KpiCard label="Refunds" value="7" change="-2 vs semana passada" changeType="positive" icon={RotateCcw} />
        <KpiCard label="Chargebacks" value="2" icon={AlertTriangle} />
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
