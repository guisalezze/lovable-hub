import { useState } from "react";
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

  const { data, isLoading } = useReportData(since, until);

  function exportPDF() {
    if (!data) return;
    setExporting(true);
    try {
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const W = 210;
      const MARGIN = 14;
      const COL = W - MARGIN * 2;
      let y = 0;

      // ── helpers ──────────────────────────────────────────────
      const addPage = () => { pdf.addPage(); y = MARGIN; };
      const checkY = (needed: number) => { if (y + needed > 280) addPage(); };

      const heading = (text: string, size = 13, bold = true) => {
        checkY(10);
        pdf.setFont("helvetica", bold ? "bold" : "normal");
        pdf.setFontSize(size);
        pdf.setTextColor(20, 20, 30);
        pdf.text(text, MARGIN, y);
        y += size * 0.5 + 2;
      };

      const sub = (text: string) => {
        checkY(7);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(110, 110, 130);
        pdf.text(text, MARGIN, y);
        y += 5;
      };

      const kpiRow = (label: string, value: string, color: [number, number, number] = [20, 20, 30]) => {
        checkY(8);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(100, 100, 120);
        pdf.text(label, MARGIN + 2, y);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.setTextColor(...color);
        pdf.text(value, MARGIN + 2, y + 5);
        y += 12;
      };

      const divider = (color: [number, number, number] = [220, 220, 235]) => {
        checkY(4);
        pdf.setDrawColor(...color);
        pdf.setLineWidth(0.3);
        pdf.line(MARGIN, y, W - MARGIN, y);
        y += 4;
      };

      const sectionBox = (title: string) => {
        checkY(14);
        pdf.setFillColor(245, 246, 252);
        pdf.roundedRect(MARGIN, y, COL, 9, 2, 2, "F");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        pdf.setTextColor(50, 50, 80);
        pdf.text(title.toUpperCase(), MARGIN + 3, y + 6);
        y += 12;
      };

      // Mini bar chart (horizontal)
      const miniBarChart = (items: { name: string; value: number }[], maxW = COL - 40) => {
        const maxVal = Math.max(...items.map(i => i.value), 1);
        items.slice(0, 10).forEach(item => {
          checkY(7);
          // label
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(8);
          pdf.setTextColor(60, 60, 80);
          const label = item.name.length > 28 ? item.name.slice(0, 26) + "…" : item.name;
          pdf.text(label, MARGIN + 2, y + 4);
          // bar
          const barW = Math.max(2, (item.value / maxVal) * maxW);
          pdf.setFillColor(99, 102, 241);
          pdf.roundedRect(MARGIN + 2, y + 5, barW, 3, 1, 1, "F");
          // value
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(7);
          pdf.setTextColor(99, 102, 241);
          pdf.text(fmt(item.value), MARGIN + 2 + barW + 2, y + 7.5);
          y += 10;
        });
      };

      // Mini line chart (area-like using dots + line)
      const miniLineChart = (points: { date: string; revenue: number }[]) => {
        if (points.length < 2) return;
        const chartH = 30;
        const chartW = COL;
        checkY(chartH + 8);
        const maxVal = Math.max(...points.map(p => p.revenue), 1);
        const step = chartW / (points.length - 1);

        // background
        pdf.setFillColor(248, 249, 255);
        pdf.rect(MARGIN, y, chartW, chartH, "F");

        // gridlines
        pdf.setDrawColor(220, 220, 235);
        pdf.setLineWidth(0.2);
        for (let g = 0; g <= 4; g++) {
          const gy = y + chartH - (g / 4) * chartH;
          pdf.line(MARGIN, gy, MARGIN + chartW, gy);
        }

        // area fill (simplified)
        const pts = points.map((p, i) => ({
          x: MARGIN + i * step,
          y: y + chartH - (p.revenue / maxVal) * (chartH - 4) - 2,
        }));

        // draw line
        pdf.setDrawColor(99, 102, 241);
        pdf.setLineWidth(0.8);
        for (let i = 0; i < pts.length - 1; i++) {
          pdf.line(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
        }

        // dots
        pts.forEach(p => {
          pdf.setFillColor(99, 102, 241);
          pdf.circle(p.x, p.y, 0.8, "F");
        });

        // x-axis labels (every few points)
        pdf.setFontSize(6);
        pdf.setTextColor(120, 120, 140);
        const step2 = Math.max(1, Math.floor(points.length / 6));
        points.forEach((p, i) => {
          if (i % step2 === 0) {
            try {
              const label = format(parseISO(p.date), "dd/MM");
              pdf.text(label, MARGIN + i * step - 3, y + chartH + 4);
            } catch { /* skip */ }
          }
        });
        y += chartH + 8;
      };

      // ── COVER / HEADER ──────────────────────────────────────
      y = MARGIN;

      // Header strip
      pdf.setFillColor(99, 102, 241);
      pdf.rect(0, 0, W, 28, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(16);
      pdf.setTextColor(255, 255, 255);
      pdf.text("OpsCRM — Relatório de Performance", MARGIN, 12);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(200, 200, 235);
      pdf.text(
        `${format(parseISO(since), "d 'de' MMMM", { locale: ptBR })} até ${format(parseISO(until), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`,
        MARGIN, 19
      );
      pdf.text(`Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}`, MARGIN, 24);
      y = 36;

      // ── KPIs ────────────────────────────────────────────────
      sectionBox("Indicadores Financeiros");

      // 2-column KPI grid
      const kpiLeft = [
        { label: "Receita Total", value: fmt(data.revenue), color: [16, 185, 129] as [number,number,number] },
        { label: "Lucro", value: fmt(data.profit), color: data.profit >= 0 ? [16, 185, 129] as [number,number,number] : [239, 68, 68] as [number,number,number] },
        { label: "ROAS", value: data.roas > 0 ? `${data.roas.toFixed(2)}x` : "–", color: [99, 102, 241] as [number,number,number] },
        { label: "Vendas Aprovadas", value: String(data.approvedCount), color: [16, 185, 129] as [number,number,number] },
      ];
      const kpiRight = [
        { label: "Investimento", value: fmt(data.investment), color: [59, 130, 246] as [number,number,number] },
        { label: "Novos Leads", value: String(data.leadsTotal), color: [59, 130, 246] as [number,number,number] },
        { label: "Conversão", value: `${data.conversionRate.toFixed(1)}%`, color: [99, 102, 241] as [number,number,number] },
        { label: "Reembolsos", value: String(data.refundCount), color: [239, 68, 68] as [number,number,number] },
      ];

      const startY = y;
      kpiLeft.forEach(k => {
        checkY(14);
        pdf.setFillColor(248, 249, 255);
        pdf.roundedRect(MARGIN, y, COL / 2 - 2, 11, 1.5, 1.5, "F");
        pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5); pdf.setTextColor(100, 100, 120);
        pdf.text(k.label, MARGIN + 2, y + 4);
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.setTextColor(...k.color);
        pdf.text(k.value, MARGIN + 2, y + 9.5);
        y += 13;
      });

      y = startY;
      kpiRight.forEach(k => {
        checkY(14);
        const rx = MARGIN + COL / 2 + 2;
        pdf.setFillColor(248, 249, 255);
        pdf.roundedRect(rx, y, COL / 2 - 2, 11, 1.5, 1.5, "F");
        pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5); pdf.setTextColor(100, 100, 120);
        pdf.text(k.label, rx + 2, y + 4);
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.setTextColor(...k.color);
        pdf.text(k.value, rx + 2, y + 9.5);
        y += 13;
      });

      y += 4;
      divider();

      // ── RECEITA POR DIA ─────────────────────────────────────
      if (data.dailyRevenue.length > 0) {
        sectionBox("Receita por Dia");
        miniLineChart(data.dailyRevenue);
        divider();
      }

      // ── RECEITA POR PRODUTO ──────────────────────────────────
      if (data.productRevenue.length > 0) {
        sectionBox("Receita por Produto");
        miniBarChart(data.productRevenue.map(p => ({ name: p.name, value: p.revenue })));
        divider();
      }

      // ── PERFORMANCE DA EQUIPE ────────────────────────────────
      if (data.teamPerformance.length > 0) {
        sectionBox("Performance da Equipe");
        // Table header
        checkY(8);
        pdf.setFillColor(230, 230, 245);
        pdf.rect(MARGIN, y, COL, 7, "F");
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.setTextColor(60, 60, 80);
        pdf.text("Membro", MARGIN + 2, y + 5);
        pdf.text("Tarefas", MARGIN + 80, y + 5);
        pdf.text("Calls", MARGIN + 110, y + 5);
        y += 8;
        data.teamPerformance.forEach((p, i) => {
          checkY(7);
          pdf.setFillColor(i % 2 === 0 ? 252 : 248, i % 2 === 0 ? 252 : 248, 255);
          pdf.rect(MARGIN, y, COL, 6.5, "F");
          pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5); pdf.setTextColor(40, 40, 60);
          pdf.text(p.name, MARGIN + 2, y + 4.5);
          pdf.text(String(p.tasks), MARGIN + 80, y + 4.5);
          pdf.text(String(p.calls), MARGIN + 110, y + 4.5);
          y += 7;
        });
        divider();
      }

      // ── FOOTER ───────────────────────────────────────────────
      checkY(10);
      pdf.setFont("helvetica", "italic"); pdf.setFontSize(7.5); pdf.setTextColor(150, 150, 170);
      pdf.text(
        `Relatório gerado pelo OpsCRM · ${format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`,
        W / 2, y + 6, { align: "center" }
      );

      // Page numbers
      const totalPages = (pdf as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFont("helvetica", "normal"); pdf.setFontSize(7); pdf.setTextColor(160, 160, 180);
        pdf.text(`Página ${i} de ${totalPages}`, W - MARGIN, 290, { align: "right" });
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

      {/* Report content */}
      <div className="space-y-6">
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
