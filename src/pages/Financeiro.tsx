import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProject } from "@/contexts/ProjectContext";
import { useMetaSpend } from "@/hooks/useMetaSpend";
import { DollarSign, TrendingUp, Target, Wallet, Plus, Download, ArrowUpRight, ArrowDownRight, BarChart2, RefreshCw, Link2, AlertCircle } from "lucide-react";
import { PeriodSelector } from "@/components/dashboard/PeriodSelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format, subDays, parseISO, differenceInDays, addMonths } from "date-fns";
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

function useNutraSalesRevenue(projectId: string | undefined, since: string, until: string) {
  return useQuery({
    queryKey: ["nutra-sales-revenue", projectId, since, until],
    queryFn: async () => {
      if (!projectId) return { totalRevenue: 0, daily: [] as { date: string; revenue: number }[] };
      const { data, error } = await supabase
        .from("nutra_sales")
        .select("created_at, amount, status")
        .eq("project_id", projectId)
        .in("status", ["approved", "paid", "complete"])
        .gte("created_at", `${since}T00:00:00`)
        .lte("created_at", `${until}T23:59:59`);
      if (error) throw error;
      const totalRevenue = (data || []).reduce((a, s) => a + Number(s.amount || 0), 0);
      const map: Record<string, number> = {};
      (data || []).forEach((s: any) => {
        const d = s.created_at.slice(0, 10);
        map[d] = (map[d] || 0) + Number(s.amount || 0);
      });
      const daily = Object.entries(map).map(([date, revenue]) => ({ date, revenue })).sort((a, b) => a.date.localeCompare(b.date));
      return { totalRevenue, daily };
    },
    enabled: !!projectId,
    staleTime: 60_000,
  });
}

function usePeriodInvestments(projectId: string | undefined, since: string, until: string) {
  return useQuery({
    queryKey: ["period-investments", projectId, since, until],
    queryFn: async () => {
      const base = supabase
        .from("investments").select("amount, date, description")
        .gte("date", since).lte("date", until);
      const query = projectId ? base.eq("project_id", projectId) : base;
      const { data, error } = await query;
      if (error) throw error;
      const total = (data || []).reduce((a, i) => a + Number(i.amount), 0);
      const daily = (data || []).map(i => ({ date: i.date, amount: Number(i.amount), description: i.description }));
      return { total, daily };
    },
    staleTime: 60_000,
  });
}

function useAllInvestments(projectId: string | undefined) {
  return useQuery({
    queryKey: ["investments", "all", projectId],
    queryFn: async () => {
      const base = supabase.from("investments").select("*").order("date", { ascending: false }).limit(50);
      const query = projectId ? base.eq("project_id", projectId) : base;
      const { data, error } = await query;
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
    ["Data", "Receita", "Investimento (Manual)", "Investimento (Ads)", "Lucro"],
    ...chartData.map(d => [d.date, d.revenue.toFixed(2), d.investment.toFixed(2), d.adSpend.toFixed(2), d.profit.toFixed(2)]),
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
  const { currentProject } = useProject();
  const isNutra = currentProject?.slug === "nutra";
  const navigate = useNavigate();

  const [since, setSince] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [until, setUntil] = useState(format(new Date(), "yyyy-MM-dd"));
  const [investAmount, setInvestAmount] = useState("");
  const [investDesc, setInvestDesc] = useState("");
  const [investType, setInvestType] = useState<"unico" | "mensal">("unico");
  const [investMonths, setInvestMonths] = useState("12");
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  // Previous period
  const days = differenceInDays(parseISO(until), parseISO(since)) + 1;
  const prevUntil = format(subDays(parseISO(since), 1), "yyyy-MM-dd");
  const prevSince = format(subDays(parseISO(since), days), "yyyy-MM-dd");

  // Revenue: sales for educacional, nutra_sales for nutra
  const { data: salesData } = usePeriodSales(since, until);
  const { data: prevSalesData } = usePeriodSales(prevSince, prevUntil);
  const { data: nutraSalesData } = useNutraSalesRevenue(isNutra ? currentProject?.id : undefined, since, until);
  const { data: prevNutraSalesData } = useNutraSalesRevenue(isNutra ? currentProject?.id : undefined, prevSince, prevUntil);

  // Manual investments filtered by project
  const { data: invData } = usePeriodInvestments(currentProject?.id, since, until);
  const { data: prevInvData } = usePeriodInvestments(currentProject?.id, prevSince, prevUntil);
  const { data: allInvestments = [] } = useAllInvestments(currentProject?.id);

  // Meta Ad Spend — mesma edge function usada no Dashboard (funciona para todos os projetos)
  const { data: metaSpend, isLoading: metaSpendLoading } = useMetaSpend({ since, until });
  const { data: prevMetaSpend } = useMetaSpend({ since: prevSince, until: prevUntil });

  const adSpendTotal = metaSpend?.total_spend ?? 0;
  const prevAdSpendTotal = prevMetaSpend?.total_spend ?? 0;
  const metaConnected = !metaSpendLoading && (adSpendTotal > 0 || metaSpend !== undefined);
  // Daily ad spend from edge function (date_start → date, spend_brl → adSpend)
  const metaDailySpend: { date: string; adSpend: number }[] = (metaSpend?.daily || []).map((d: any) => ({
    date: d.date_start?.slice(0, 10) || "",
    adSpend: Number(d.spend_brl || d.spend_usd || 0),
  }));

  // Use appropriate revenue source
  const revenueData = isNutra ? nutraSalesData : salesData;
  const prevRevenueData = isNutra ? prevNutraSalesData : prevSalesData;

  const totalRevenue = revenueData?.totalRevenue ?? 0;
  const manualInvestment = invData?.total ?? 0;
  const totalInvestment = manualInvestment + adSpendTotal;
  const profit = totalRevenue - totalInvestment;
  const roas = totalInvestment > 0 ? (totalRevenue / totalInvestment).toFixed(1) : "—";

  const prevRevenue = prevRevenueData?.totalRevenue ?? 0;
  const prevManualInvestment = prevInvData?.total ?? 0;
  const prevTotalInvestment = prevManualInvestment + prevAdSpendTotal;
  const prevProfit = prevRevenue - prevTotalInvestment;

  // Chart data
  const chartData = useMemo(() => {
    const map: Record<string, { date: string; revenue: number; investment: number; adSpend: number; profit: number }> = {};
    (revenueData?.daily || []).forEach((d: any) => {
      map[d.date] = { date: d.date, revenue: d.revenue, investment: 0, adSpend: 0, profit: 0 };
    });
    (invData?.daily || []).forEach((i: any) => {
      if (!map[i.date]) map[i.date] = { date: i.date, revenue: 0, investment: 0, adSpend: 0, profit: 0 };
      map[i.date].investment += i.amount;
    });
    // Ad spend por dia (via edge function)
    metaDailySpend.forEach((d) => {
      if (!d.date) return;
      if (!map[d.date]) map[d.date] = { date: d.date, revenue: 0, investment: 0, adSpend: 0, profit: 0 };
      map[d.date].adSpend += d.adSpend;
    });
    return Object.values(map)
      .map(d => ({ ...d, profit: d.revenue - d.investment - d.adSpend }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [revenueData, invData, metaDailySpend]);

  async function addInvestment() {
    const amount = parseFloat(investAmount);
    if (!amount || amount <= 0) return toast.error("Valor inválido");

    const baseDate = new Date();
    const rows = investType === "mensal"
      ? Array.from({ length: Math.max(1, parseInt(investMonths) || 12) }, (_, i) => ({
          amount,
          description: investDesc ? `${investDesc} (mês ${i + 1}/${parseInt(investMonths) || 12})` : `Gasto mensal (mês ${i + 1})`,
          project_id: currentProject?.id || null,
          date: format(addMonths(baseDate, i), "yyyy-MM-dd"),
        }))
      : [{
          amount,
          description: investDesc || null,
          project_id: currentProject?.id || null,
        }];

    const { error } = await supabase.from("investments").insert(rows);
    if (error) return toast.error("Erro ao salvar");
    toast.success(investType === "mensal" ? `${rows.length} lançamentos mensais registrados!` : "Investimento registrado");
    setInvestAmount("");
    setInvestDesc("");
    setInvestType("unico");
    setInvestMonths("12");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["period-investments"] });
    qc.invalidateQueries({ queryKey: ["investments", "all"] });
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {currentProject?.icon} Financeiro · {currentProject?.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Receita, investimento e ROAS</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PeriodSelector since={since} until={until} onChange={(s, u) => { setSince(s); setUntil(u); }} />
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => exportCSV(chartData, since, until)}>
            <Download className="h-3.5 w-3.5" />CSV
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Gasto Manual</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo Gasto Manual</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Valor (R$)</Label>
                  <Input placeholder="0,00" type="number" value={investAmount} onChange={(e) => setInvestAmount(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Descrição (opcional)</Label>
                  <Input placeholder="Ex: Ferramenta X, Equipe Y..." value={investDesc} onChange={(e) => setInvestDesc(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tipo de gasto</Label>
                  <Select value={investType} onValueChange={(v) => setInvestType(v as "unico" | "mensal")}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unico">Gasto único (pontual)</SelectItem>
                      <SelectItem value="mensal">Gasto mensal (recorrente)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {investType === "mensal" && (
                  <div className="space-y-1.5 animate-fade-in">
                    <Label className="text-xs">Por quantos meses?</Label>
                    <Input type="number" min={1} max={60} value={investMonths} onChange={(e) => setInvestMonths(e.target.value)} />
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <RefreshCw className="h-3 w-3" />
                      Serão criados {parseInt(investMonths) || 12} lançamentos mensais a partir de hoje
                    </p>
                  </div>
                )}
                <Button onClick={addInvestment} className="w-full gap-2">
                  {investType === "mensal" ? <><RefreshCw className="h-4 w-4" />Criar lançamentos mensais</> : "Salvar gasto"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="glass-card p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground"><DollarSign className="h-4 w-4" /><span className="text-xs font-medium">Receita</span></div>
          <p className="text-xl font-bold text-foreground">{fmtBRL(totalRevenue)}</p>
          <DeltaBadge current={totalRevenue} previous={prevRevenue} />
        </div>
        <div className="glass-card p-4 space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted-foreground">
              <BarChart2 className="h-4 w-4" />
              <span className="text-xs font-medium">Ads Spend</span>
            </div>
            {metaSpendLoading ? (
              <Badge variant="secondary" className="text-[9px] px-1.5">
                Carregando...
              </Badge>
            ) : metaConnected ? (
              <Badge
                variant="secondary"
                className="text-[9px] px-1.5 gap-0.5 cursor-pointer hover:bg-primary/20 transition-colors"
                onClick={() => navigate(isNutra ? "/nutra/meta-ads" : "/integracoes")}
              >
                <Link2 className="h-2.5 w-2.5" />
                Meta Ads
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-[9px] px-1.5 gap-0.5 cursor-pointer border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => navigate("/integracoes")}
              >
                <AlertCircle className="h-2.5 w-2.5" />
                Desconectado
              </Badge>
            )}
          </div>
          <p className="text-xl font-bold text-foreground">{fmtBRL(adSpendTotal)}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <DeltaBadge current={adSpendTotal} previous={prevAdSpendTotal} />
          </div>
        </div>
        <div className="glass-card p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground"><Wallet className="h-4 w-4" /><span className="text-xs font-medium">Gastos Manuais</span></div>
          <p className="text-xl font-bold text-foreground">{fmtBRL(manualInvestment)}</p>
          <DeltaBadge current={manualInvestment} previous={prevManualInvestment} />
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
              <Bar dataKey="investment" name="Gastos Manuais" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="adSpend" name="Ads Spend" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Line dataKey="profit" name="Lucro" stroke="#10b981" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Product Goals - only for educacional */}
      {!isNutra && <ProductGoalsSection since={since} until={until} />}

      {/* Manual Investment History */}
      {allInvestments.length > 0 && (
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Histórico de Gastos Manuais</h3>
          <div className="space-y-2">
            {allInvestments.map((inv: any) => (
              <div key={inv.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                <div className="flex items-center gap-3">
                  <BarChart2 className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm text-foreground">{inv.description || "Gasto manual"}</p>
                      {inv.description?.includes("mês") && (
                        <Badge variant="secondary" className="text-[9px] h-4 px-1.5 gap-0.5">
                          <RefreshCw className="h-2.5 w-2.5" />mensal
                        </Badge>
                      )}
                    </div>
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
