import { HeroMetrics } from "@/components/dashboard/HeroMetrics";
import { OperationalCards } from "@/components/dashboard/OperationalCards";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { SalesChart } from "@/components/dashboard/SalesChart";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Target, TrendingUp, Users, DollarSign } from "lucide-react";

// Dados 100% estáticos — sem Supabase, sem login. Só para avaliar o design visualmente.
const mockRevenueData = [
  { date: "01/08", receita: 4200 },
  { date: "02/08", receita: 5100 },
  { date: "03/08", receita: 3800 },
  { date: "04/08", receita: 6300 },
  { date: "05/08", receita: 7100 },
  { date: "06/08", receita: 6800 },
  { date: "07/08", receita: 8200 },
];

const mockSalesData = [
  { produto: "Curso Avançado", vendas: 42 },
  { produto: "Mentoria VIP", vendas: 28 },
  { produto: "Ebook Guia", vendas: 65 },
  { produto: "Consultoria", vendas: 19 },
];

const DesignPreview = () => {
  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="space-y-4 sm:space-y-6 w-full max-w-7xl mx-auto relative">
        <div
          className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[420px] opacity-60 dark:opacity-30"
          style={{
            background:
              "radial-gradient(60% 100% at 20% 0%, hsl(var(--primary) / 0.10), transparent), radial-gradient(50% 80% at 85% 0%, hsl(var(--accent-foreground) / 0.10), transparent)",
          }}
        />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div>
            <p className="eyebrow">Prévia de Design (sem login)</p>
            <h1 className="heading-display text-xl sm:text-2xl text-foreground">
              🎨 Dashboard · Estilo Apple
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Dados fictícios — só para avaliar visual, animação e materiais
            </p>
          </div>
        </div>

        {/* Zona 1 — Hero Metrics */}
        <HeroMetrics
          revenue={45231.5}
          profit={28104.2}
          roas="3.4"
          previousRevenue={38900}
          investment={17127.3}
          isLoading={false}
        />

        {/* Meta do período */}
        <div className="material-card p-4 animate-material-in">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold text-foreground">Meta do Período</span>
              <span className="text-xs text-muted-foreground">R$ 45.231,50 de R$ 60.000,00</span>
            </div>
            <span className="text-xs font-bold text-foreground">75%</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2.5 bg-secondary rounded-full overflow-hidden">
              <div className="h-full w-full bg-primary rounded-full transition-transform duration-300 ease-out" style={{ transform: "translateX(-25%)" }} />
            </div>
            <span className="text-xs font-bold text-foreground">75%</span>
          </div>
        </div>

        {/* Zona 2 — Operacional */}
        <OperationalCards
          investment={17127.3}
          investmentLabel="01/08 → 08/08"
          approvedCount={214}
          pendingCount={12}
          refundCount={4}
          chargebackCount={1}
          isLoading={false}
        />

        {/* KPI cards soltos (componente KpiCard, hoje sem uso no dashboard real) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-in">
          <KpiCard label="Novos Leads" value="312" change="+18% vs período anterior" changeType="positive" icon={Users} />
          <KpiCard label="Ticket Médio" value="R$ 211,40" change="+4,2%" changeType="positive" icon={DollarSign} />
          <KpiCard label="Taxa de Conversão" value="8,7%" change="-1,1%" changeType="negative" icon={TrendingUp} />
          <KpiCard label="Meta Batida" value="75%" icon={Target} />
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 stagger-in">
          <RevenueChart data={mockRevenueData} isLoading={false} />
          <SalesChart data={mockSalesData} isLoading={false} />
        </div>

        {/* Cards de lista estáticos — mesma linguagem visual do RecentLeads / ChargesHealthCard reais */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 stagger-in">
          <div className="material-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Leads Recentes</h3>
            <div className="space-y-3">
              {["Marina Costa", "João Pedro Alves", "Beatriz Lima"].map((name) => (
                <div key={name} className="flex items-center justify-between text-sm press-scale rounded-md px-2 py-1.5 -mx-2 cursor-pointer hover:bg-secondary/60">
                  <span className="text-foreground">{name}</span>
                  <span className="text-xs text-muted-foreground">há 2h</span>
                </div>
              ))}
            </div>
          </div>
          <div className="material-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Saúde de Cobranças</h3>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold text-foreground">96,2%</p>
              <span className="text-xs text-success">saudável</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">4 refunds · 1 chargeback nos últimos 7 dias</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DesignPreview;
