import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, TrendingUp, Target, Wallet, Plus, Download, ArrowUpRight, ArrowDownRight, BarChart2 } from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { PeriodSelector } from "@/components/dashboard/PeriodSelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, subDays, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { ProductGoalsSection } from "@/components/financeiro/ProductGoalsSection";

function usePeriodSales(since: string, until: string) {
  return useQuery({
    queryKey: ["period-sales", since, until],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales").select("created_at, sale_amount, sale_status_enum")
        .eq("sale_status_enum", "approved")
        .gte("created_at", `${since}T00:00:00`)
        .lte("created_at", `${until}T23:59:59`);
      if (error) throw error;
      const totalRevenue = (data || []).reduce((a, s) => a + Number(s.sale_amount || 0), 0);
      const map: Record<string, number> = {};
      (data || []).forEach((s: any) => {
        const d = s.created_at.slice(0, 10);
        map[d] = (map[d] || 0) + Number(s.sale_amount || 0);
      });
      const daily = Object.entries(map).map(([date, revenue]) => ({ date, revenue })).sort((a, b) => a.date.localeCompare(b.date));
      return { totalRevenue, daily };
    },
    staleTime: 60_000,
  });
}

function usePeriodInvestments(since: string, until: string) {
  return useQuery({
    queryKey: ["period-investments", since, until],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("investments").select("amount, date, description")
        .gte("date", since).lte("date", until);
      if (error) throw error;
      const total = (data || []).reduce((a, i) => a + Number(i.amount), 0);
      const daily = (data || []).map(i => ({ date: i.date, amount: Number(i.amount), description: i.description }));
      return { total, daily };
    },
    staleTime: 60_000,
  });
}

function useAllInvestments() {
  return useQuery({
    queryKey: ["investments", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("investments").select("*").order("date", { ascending: false }).limit(50);
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
  });
}

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return null;
  const delta = ((current - previous) / Math.abs(previous)) * 100;
  const positive = delta >= 0;
  return (
    <span className={`text-xs font-medium flex items-center gap-0.5 ${positive ? "text-emerald-500" : "text-destructive"}`}>
      {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

const fmtShort = (v: number) => v >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : `R$${v.toFixed(0)}`;
const fmtBRL = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function exportCSV(chartData: any[], since: string, until: string) {
  const rows = [
    ["Data", "Receita", "Investimento", "Lucro"],
    ...chartData.map(d => [d.date, d.revenue.toFixed(2), d.investment.toFixed(2), d.profit.toFixed(2)]),
  ];
  const csv = rows.map(r => r.join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `financeiro_${since}_${until}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success("CSV exportado!");
}

export default function FinanceiroPage() {
  const [since, setSince] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [until, setUntil] = useState(format(new Date(), "yyyy-MM-dd"));
  const [investAmount, setInvestAmount] = useState("");
  const [investDesc, setInvestDesc] = useState("");
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  // Previous period
  const days = differenceInDays(parseISO(until), parseISO(since)) + 1;
  const prevUntil = format(subDays(parseISO(since), 1), "yyyy-MM-dd");
  const prevSince = format(subDays(parseISO(since), days), "yyyy-MM-dd");

  const { data: salesData } = usePeriodSales(since, until);
  const { data: prevSalesData } = usePeriodSales(prevSince, prevUntil);
  const { data: invData } = usePeriodInvestments(since, until);
  const { data: prevInvData } = usePeriodInvestments(prevSince, prevUntil);
  const { data: allInvestments = [] } = useAllInvestments();

  const totalRevenue = salesData?.totalRevenue ?? 0;
  const totalInvestment = invData?.total ?? 0;
  const profit = totalRevenue - totalInvestment;
  const roas = totalInvestment > 0 ? (totalRevenue / totalInvestment).toFixed(1) : "—";

  const prevRevenue = prevSalesData?.totalRevenue ?? 0;
  const prevInvestment = prevInvData?.total ?? 0;
  const prevProfit = prevRevenue - prevInvestment;

  // Chart data
  const chartData = useMemo(() => {
    const map: Record<string, { date: string; revenue: number; investment: number; profit: number }> = {};
    (salesData?.daily || []).forEach(d => {
      map[d.date] = { date: d.date, revenue: d.revenue, investment: 0, profit: 0 };
    });
    (invData?.daily || []).forEach(i => {
      if (!map[i.date]) map[i.date] = { date: i.date, revenue: 0, investment: 0, profit: 0 };
      map[i.date].investment += i.amount;
    });
    return Object.values(map)
      .map(d => ({ ...d, profit: d.revenue - d.investment }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [salesData, invData]);

  async function addInvestment() {
    const amount = parseFloat(investAmount);
    if (!amount || amount <= 0) return toast.error("Valor inválido");
    const { error } = await supabase.from("investments").insert({ amount, description: investDesc || null });
    if (error) return toast.error("Erro ao salvar");
    toast.success("Investimento registrado");
    setInvestAmount("");
    setInvestDesc("");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["period-investments"] });
    qc.invalidateQueries({ queryKey: ["investments", "all"] });
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Financeiro</h1>
          <p className="text-sm text-muted-foreground mt-1">Receita, investimento e ROAS</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PeriodSelector since={since} until={until} onChange={(s, u) => { setSince(s); setUntil(u); }} />
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => exportCSV(chartData, since, until)}>
            <Download className="h-3.5 w-3.5" />CSV
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Investimento</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo Investimento</DialogTitle></DialogHeader>
              <div className="space-y-3 mt-2">
                <Input placeholder="Valor (R$)" type="number" value={investAmount} onChange={(e) => setInvestAmount(e.target.value)} />
                <Input placeholder="Descrição (opcional)" value={investDesc} onChange={(e) => setInvestDesc(e.target.value)} />
                <Button onClick={addInvestment} className="w-full">Salvar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground"><DollarSign className="h-4 w-4" /><span className="text-xs font-medium">Receita Total</span></div>
          <p className="text-xl font-bold text-foreground">{fmtBRL(totalRevenue)}</p>
          <DeltaBadge current={totalRevenue} previous={prevRevenue} />
        </div>
        <div className="glass-card p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground"><Wallet className="h-4 w-4" /><span className="text-xs font-medium">Investimento</span></div>
          <p className="text-xl font-bold text-foreground">{fmtBRL(totalInvestment)}</p>
          <DeltaBadge current={totalInvestment} previous={prevInvestment} />
        </div>
        <div className="glass-card p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground"><TrendingUp className="h-4 w-4" /><span className="text-xs font-medium">Lucro</span></div>
          <p className={`text-xl font-bold ${profit >= 0 ? "text-emerald-500" : "text-destructive"}`}>{fmtBRL(profit)}</p>
          <DeltaBadge current={profit} previous={prevProfit} />
        </div>
        <div className="glass-card p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground"><Target className="h-4 w-4" /><span className="text-xs font-medium">ROAS</span></div>
          <p className="text-xl font-bold text-foreground">{roas}x</p>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">Receita vs Investimento vs Lucro</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tickFormatter={d => { try { return format(parseISO(d), "dd/MM"); } catch { return d; }}} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tickFormatter={v => fmtShort(v)} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip formatter={(v: number) => fmtBRL(v)} labelFormatter={d => { try { return format(parseISO(d as string), "dd/MM/yyyy"); } catch { return d; }}} />
              <Legend />
              <Bar dataKey="revenue" name="Receita" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="investment" name="Investimento" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Line dataKey="profit" name="Lucro" stroke="#10b981" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Product Goals */}
      <ProductGoalsSection since={since} until={until} />

      {/* Investment History */}
      {allInvestments.length > 0 && (
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Histórico de Investimentos</h3>
          <div className="space-y-2">
            {allInvestments.map((inv: any) => (
              <div key={inv.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                <div className="flex items-center gap-3">
                  <BarChart2 className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-foreground">{inv.description || "Investimento em tráfego"}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {(() => { try { return format(parseISO(inv.date), "d 'de' MMM 'de' yyyy", { locale: ptBR }); } catch { return inv.date; }})()}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-blue-500">{fmtBRL(Number(inv.amount))}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
