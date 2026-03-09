import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Download, TrendingUp, TrendingDown, Users, DollarSign,
  Target, BarChart2, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PeriodSelector } from "@/components/dashboard/PeriodSelector";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

function useReportData(since: string, until: string) {
  return useQuery({
    queryKey: ["report", since, until],
    queryFn: async () => {
      const [salesRes, leadsRes, tasksRes, callsRes, invRes, teamRes] = await Promise.all([
        supabase.from("sales").select("sale_amount, sale_status_enum, created_at, product_name")
          .gte("created_at", `${since}T00:00:00`).lte("created_at", `${until}T23:59:59`),
        supabase.from("leads").select("id, status, source, created_at")
          .gte("created_at", `${since}T00:00:00`).lte("created_at", `${until}T23:59:59`),
        supabase.from("tasks").select("id, status, completed_at, assigned_to")
          .gte("created_at", `${since}T00:00:00`).lte("created_at", `${until}T23:59:59`),
        supabase.from("calls").select("id, status, start_at")
          .gte("start_at", `${since}T00:00:00`).lte("start_at", `${until}T23:59:59`),
        supabase.from("investments").select("amount, date").gte("date", since).lte("date", until),
        supabase.from("profiles").select("id, full_name, email"),
      ]);

      const sales = salesRes.data || [];
      const leads = leadsRes.data || [];
      const tasks = tasksRes.data || [];
      const calls = callsRes.data || [];
      const investments = invRes.data || [];
      const profiles = teamRes.data || [];

      const revenue = sales
        .filter(s => s.sale_status_enum === "approved")
        .reduce((acc, s) => acc + Number(s.sale_amount || 0), 0);
      const investment = investments.reduce((acc, i) => acc + Number(i.amount), 0);
      const profit = revenue - investment;
      const roas = investment > 0 ? revenue / investment : 0;
      const approvedCount = sales.filter(s => s.sale_status_enum === "approved").length;
      const refundCount = sales.filter(s =>
        s.sale_status_enum === "refunded" || s.sale_status_enum === "charged_back"
      ).length;
      const conversionRate = leads.length > 0
        ? (leads.filter(l => l.status === "comprou").length / leads.length * 100) : 0;

      // Revenue by day
      const revenueByDay: Record<string, number> = {};
      sales.filter(s => s.sale_status_enum === "approved").forEach(s => {
        const d = s.created_at.slice(0, 10);
        revenueByDay[d] = (revenueByDay[d] || 0) + Number(s.sale_amount || 0);
      });
      const dailyRevenue = Object.entries(revenueByDay)
        .map(([date, rev]) => ({ date, revenue: rev }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Revenue by product
      const revenueByProduct: Record<string, number> = {};
      sales.filter(s => s.sale_status_enum === "approved").forEach(s => {
        const p = s.product_name || "Outros";
        revenueByProduct[p] = (revenueByProduct[p] || 0) + Number(s.sale_amount || 0);
      });
      const productRevenue = Object.entries(revenueByProduct)
        .map(([name, rev]) => ({ name, revenue: rev }))
        .sort((a, b) => b.revenue - a.revenue);

      // Team performance
      const teamPerformance = profiles.map(p => ({
        name: (p.full_name || p.email || "").split(" ")[0],
        tasks: tasks.filter(t => t.assigned_to === p.id && t.status === "concluido").length,
        calls: calls.filter(c => (c as any).owner_user_id === p.id && c.status === "completed").length,
      })).filter(p => p.tasks > 0 || p.calls > 0);

      return {
        revenue, investment, profit, roas, approvedCount, refundCount,
        conversionRate, dailyRevenue, productRevenue, teamPerformance,
        leadsTotal: leads.length,
        tasksCompleted: tasks.filter(t => t.status === "concluido").length,
        callsDone: calls.filter(c => c.status === "completed").length,
      };
    },
    staleTime: 60_000,
  });
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function RelatoriosPage() {
  const [since, setSince] = useState(format(subDays(new Date(), 29), "yyyy-MM-dd"));
  const [until, setUntil] = useState(format(new Date(), "yyyy-MM-dd"));
  const [exporting, setExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useReportData(since, until);

  async function exportPDF() {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 10;
      pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - 20;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight + 10;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
        heightLeft -= pageHeight - 20;
      }
      pdf.save(`relatorio_${since}_${until}.pdf`);
    } finally {
      setExporting(false);
    }
  }

  const kpis = [
    { label: "Receita", value: fmt(data?.revenue || 0), icon: DollarSign, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Investimento", value: fmt(data?.investment || 0), icon: BarChart2, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Lucro", value: fmt(data?.profit || 0), icon: (data?.profit ?? 0) >= 0 ? TrendingUp : TrendingDown, color: (data?.profit ?? 0) >= 0 ? "text-emerald-500" : "text-destructive", bg: (data?.profit ?? 0) >= 0 ? "bg-emerald-500/10" : "bg-destructive/10" },
    { label: "ROAS", value: (data?.roas ?? 0) > 0 ? `${data!.roas.toFixed(2)}x` : "–", icon: Target, color: "text-primary", bg: "bg-primary/10" },
    { label: "Vendas aprovadas", value: String(data?.approvedCount || 0), icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Novos leads", value: String(data?.leadsTotal || 0), icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Conversão", value: `${(data?.conversionRate || 0).toFixed(1)}%`, icon: Target, color: "text-primary", bg: "bg-primary/10" },
    { label: "Reembolsos", value: String(data?.refundCount || 0), icon: TrendingDown, color: "text-destructive", bg: "bg-destructive/10" },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>
          <p className="text-sm text-muted-foreground mt-1">Visão consolidada da operação</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PeriodSelector since={since} until={until} onChange={(s, u) => { setSince(s); setUntil(u); }} />
          <Button size="sm" className="gap-1.5 text-xs" onClick={exportPDF} disabled={exporting || isLoading}>
            <Download className="h-3.5 w-3.5" />
            {exporting ? "Gerando PDF..." : "Exportar PDF"}
          </Button>
        </div>
      </div>

      {/* Report content for PDF capture */}
      <div ref={reportRef} className="space-y-6">
        {/* Report header */}
        <div className="glass-card p-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">OpsCRM — Relatório de Performance</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {format(parseISO(since), "d 'de' MMMM", { locale: ptBR })} até{" "}
              {format(parseISO(until), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </p>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Gerado em {format(new Date(), "d/MM/yyyy 'às' HH:mm")}
          </p>
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map(k => (
            <div key={k.label} className="glass-card p-4 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">{k.label}</span>
                <div className={`h-7 w-7 rounded-md ${k.bg} flex items-center justify-center`}>
                  <k.icon className={`h-3.5 w-3.5 ${k.color}`} />
                </div>
              </div>
              <p className="text-lg font-bold text-foreground">{k.value}</p>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Daily revenue */}
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Receita por Dia</h3>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={data?.dailyRevenue || []}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tickFormatter={d => { try { return format(parseISO(d), "dd/MM"); } catch { return d; } }} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v: number) => [fmt(v), "Receita"]}
                  labelFormatter={l => { try { return format(parseISO(l as string), "d 'de' MMM", { locale: ptBR }); } catch { return String(l); } }}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
                <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="url(#revGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Revenue by product */}
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Receita por Produto</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data?.productRevenue || []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  formatter={(v: number) => [fmt(v), "Receita"]}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Team performance */}
        {(data?.teamPerformance || []).length > 0 && (
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Performance da Equipe</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data?.teamPerformance}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend />
                <Bar dataKey="tasks" name="Tarefas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="calls" name="Calls" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Footer */}
        <p className="text-[10px] text-muted-foreground text-center py-2">
          Relatório gerado pelo OpsCRM · {format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
        </p>
      </div>
    </div>
  );
}
