import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, parseISO, formatDistanceToNow, differenceInDays, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";

/** Intervalo em UTC equivalente aos dias civis [since, until] em America/Sao_Paulo (UTC−3, sem horário de verão). */
export function brazilCivilRangeUtcIso(since: string, until: string): { startIso: string; endIso: string } {
  const startIso = `${since}T03:00:00.000Z`;
  const endDayAfter = addDays(parseISO(`${until}T12:00:00`), 1);
  const endIso = `${format(endDayAfter, "yyyy-MM-dd")}T02:59:59.999Z`;
  return { startIso, endIso };
}

/** Rótulo dd/MM no fuso de Brasília (para gráficos baterem com "Ontem" / período). */
function dayLabelBrazil(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  }).format(parseISO(iso));
}

/** Venda aprovada (texto atual ou legado quando o webhook gravava o código numérico como string). */
export function isApprovedSaleStatus(status: string | null | undefined): boolean {
  if (status == null || status === "") return false;
  const s = String(status).toLowerCase();
  if (s === "approved" || s === "authorized" || s === "completed") return true;
  if (s === "2" || s === "8" || s === "10") return true;
  return false;
}

/**
 * Vendas que "tocam" o período civil BR: data de aprovação, data do pedido (PP) ou data de gravação no CRM.
 * Evita sumir venda antiga só porque `date_approved` está vazio/errado enquanto `date_created`/`created_at` batem.
 */
async function fetchSalesTouchingBrazilPeriod(
  startIso: string,
  endIso: string,
  columns: string
): Promise<Record<string, unknown>[]> {
  const col = columns.includes("id") ? columns : `id, ${columns}`;
  const [byApprovedAt, byOrderDate, byRowCreated] = await Promise.all([
    supabase
      .from("sales")
      .select(col)
      .not("date_approved", "is", null)
      .gte("date_approved", startIso)
      .lte("date_approved", endIso),
    supabase
      .from("sales")
      .select(col)
      .not("date_created", "is", null)
      .gte("date_created", startIso)
      .lte("date_created", endIso),
    supabase
      .from("sales")
      .select(col)
      .gte("created_at", startIso)
      .lte("created_at", endIso),
  ]);
  if (byApprovedAt.error) throw byApprovedAt.error;
  if (byOrderDate.error) throw byOrderDate.error;
  if (byRowCreated.error) throw byRowCreated.error;

  const map = new Map<string, Record<string, unknown>>();
  for (const row of [...(byApprovedAt.data ?? []), ...(byOrderDate.data ?? []), ...(byRowCreated.data ?? [])]) {
    const id = row.id as string | undefined;
    if (id && !map.has(id)) map.set(id, row);
  }
  return Array.from(map.values());
}

interface DashboardFilters {
  since: string;
  until: string;
}

interface NutraDashboardFilters {
  since: string;
  until: string;
  projectId: string | undefined;
}

export function useDashboardKpis({ since, until }: DashboardFilters) {
  return useQuery({
    queryKey: ["dashboard-kpis", since, until],
    queryFn: async () => {
      const { startIso, endIso } = brazilCivilRangeUtcIso(since, until);
      const sales = await fetchSalesTouchingBrazilPeriod(
        startIso,
        endIso,
        "sale_amount, sale_status_enum, date_approved, date_created, created_at"
      );

      const approved = sales?.filter((s) => isApprovedSaleStatus(s.sale_status_enum as string)) || [];
      const pending = sales?.filter((s) => s.sale_status_enum === "pending" || s.sale_status_enum === "in_process" || s.sale_status_enum === "in_review") || [];
      const refunded = sales?.filter((s) => s.sale_status_enum === "refunded" || s.sale_status_enum === "pre_refunded") || [];
      const chargebacks = sales?.filter((s) => s.sale_status_enum === "charged_back" || s.sale_status_enum === "pre_chargeback") || [];

      const salesRevenue = approved.reduce((sum, s) => sum + Number(s.sale_amount || 0), 0);

      // Mentorias: paid_amount atribuído pela data de início do contrato (contract_start)
      let mentoriasRevenue = 0;
      try {
        const { data: impls } = await (supabase as any)
          .from("implementations")
          .select("paid_amount")
          .gte("contract_start", since)
          .lte("contract_start", until);
        mentoriasRevenue = (impls || []).reduce((sum: number, i: any) => sum + Number(i.paid_amount || 0), 0);
      } catch {
        mentoriasRevenue = 0;
      }

      return {
        revenue: salesRevenue + mentoriasRevenue,
        salesRevenue,
        mentoriasRevenue,
        approvedCount: approved.length,
        pendingCount: pending.length,
        refundCount: refunded.length,
        chargebackCount: chargebacks.length,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useDailyRevenue({ since, until }: DashboardFilters) {
  return useQuery({
    queryKey: ["daily-revenue", since, until],
    queryFn: async () => {
      const { startIso, endIso } = brazilCivilRangeUtcIso(since, until);
      const raw = await fetchSalesTouchingBrazilPeriod(
        startIso,
        endIso,
        "sale_amount, sale_status_enum, date_approved, date_created, created_at"
      );
      const sales = raw.filter((s) => isApprovedSaleStatus(s.sale_status_enum as string));

      const byDay: Record<string, number> = {};
      sales.forEach((s) => {
        const ref = (s.date_approved || s.date_created || s.created_at) as string | undefined;
        if (ref) {
          const day = dayLabelBrazil(ref);
          byDay[day] = (byDay[day] || 0) + Number(s.sale_amount || 0);
        }
      });

      // Mentorias: atribuídas ao contract_start
      try {
        const { data: impls } = await (supabase as any)
          .from("implementations")
          .select("paid_amount, contract_start")
          .gte("contract_start", since)
          .lte("contract_start", until);
        (impls || []).forEach((i: any) => {
          if (i.contract_start && Number(i.paid_amount || 0) > 0) {
            const day = dayLabelBrazil(
              typeof i.contract_start === "string" && i.contract_start.length <= 10
                ? `${i.contract_start}T12:00:00.000Z`
                : i.contract_start
            );
            byDay[day] = (byDay[day] || 0) + Number(i.paid_amount || 0);
          }
        });
      } catch {
        // paid_amount column may not exist yet — skip
      }

      return Object.entries(byDay)
        .map(([date, receita]) => ({ date, receita }))
        .sort((a, b) => a.date.localeCompare(b.date));
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useSalesByProduct({ since, until }: DashboardFilters) {
  return useQuery({
    queryKey: ["sales-by-product", since, until],
    queryFn: async () => {
      const { startIso, endIso } = brazilCivilRangeUtcIso(since, until);
      const raw = await fetchSalesTouchingBrazilPeriod(
        startIso,
        endIso,
        "product_name, sale_status_enum, date_approved, date_created, created_at"
      );
      const sales = raw.filter((s) => isApprovedSaleStatus(s.sale_status_enum as string));

      const byProduct: Record<string, number> = {};
      sales.forEach((s) => {
        const name = s.product_name || "Sem nome";
        byProduct[name] = (byProduct[name] || 0) + 1;
      });

      return Object.entries(byProduct)
        .map(([produto, vendas]) => ({ produto, vendas }))
        .sort((a, b) => b.vendas - a.vendas);
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function usePreviousPeriodKpis({ since, until }: DashboardFilters) {
  return useQuery({
    queryKey: ["previous-period-kpis", since, until],
    queryFn: async () => {
      const days = differenceInDays(parseISO(until), parseISO(since)) + 1;
      const prevUntil = format(subDays(parseISO(since), 1), "yyyy-MM-dd");
      const prevSince = format(subDays(parseISO(since), days), "yyyy-MM-dd");
      const { startIso: prevStart, endIso: prevEnd } = brazilCivilRangeUtcIso(prevSince, prevUntil);

      const sales = await fetchSalesTouchingBrazilPeriod(
        prevStart,
        prevEnd,
        "sale_amount, sale_status_enum, date_approved, date_created, created_at"
      );

      const approved = sales?.filter((s) => isApprovedSaleStatus(s.sale_status_enum as string)) || [];
      const salesRevenue = approved.reduce((sum, s) => sum + Number(s.sale_amount || 0), 0);

      let mentoriasRevenue = 0;
      try {
        const { data: impls } = await (supabase as any)
          .from("implementations")
          .select("paid_amount")
          .gte("contract_start", prevSince)
          .lte("contract_start", prevUntil);
        mentoriasRevenue = (impls || []).reduce((sum: number, i: any) => sum + Number(i.paid_amount || 0), 0);
      } catch {
        mentoriasRevenue = 0;
      }

      return { previousRevenue: salesRevenue + mentoriasRevenue };
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Nutra hooks ──────────────────────────────────────────────────────────────

const NUTRA_APPROVED = ["approved", "paid", "complete"];

export function useDashboardNutraKpis({ since, until, projectId }: NutraDashboardFilters) {
  return useQuery({
    queryKey: ["dashboard-nutra-kpis", since, until, projectId],
    queryFn: async () => {
      if (!projectId) return { revenue: 0, approvedCount: 0, pendingCount: 0, refundCount: 0, chargebackCount: 0 };
      const { startIso, endIso } = brazilCivilRangeUtcIso(since, until);
      const { data, error } = await supabase
        .from("nutra_sales")
        .select("amount, status")
        .eq("project_id", projectId)
        .gte("created_at", startIso)
        .lte("created_at", endIso);
      if (error) throw error;
      const approved = (data || []).filter((s) => NUTRA_APPROVED.includes(s.status));
      const pending = (data || []).filter((s) => s.status === "pending");
      const refunded = (data || []).filter((s) => s.status === "refunded");
      const chargebacks = (data || []).filter((s) => s.status === "chargeback");
      const revenue = approved.reduce((sum, s) => sum + Number(s.amount || 0), 0);
      return { revenue, approvedCount: approved.length, pendingCount: pending.length, refundCount: refunded.length, chargebackCount: chargebacks.length };
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!projectId,
  });
}

export function useDailyNutraRevenue({ since, until, projectId }: NutraDashboardFilters) {
  return useQuery({
    queryKey: ["daily-nutra-revenue", since, until, projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { startIso, endIso } = brazilCivilRangeUtcIso(since, until);
      const { data, error } = await supabase
        .from("nutra_sales")
        .select("amount, status, created_at")
        .eq("project_id", projectId)
        .in("status", NUTRA_APPROVED)
        .gte("created_at", startIso)
        .lte("created_at", endIso);
      if (error) throw error;
      const byDay: Record<string, number> = {};
      (data || []).forEach((s) => {
        if (s.created_at) {
          const day = dayLabelBrazil(s.created_at);
          byDay[day] = (byDay[day] || 0) + Number(s.amount || 0);
        }
      });
      return Object.entries(byDay).map(([date, receita]) => ({ date, receita })).sort((a, b) => a.date.localeCompare(b.date));
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!projectId,
  });
}

export function useSalesByNutraProduct({ since, until, projectId }: NutraDashboardFilters) {
  return useQuery({
    queryKey: ["nutra-sales-by-product", since, until, projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { startIso, endIso } = brazilCivilRangeUtcIso(since, until);
      const { data, error } = await supabase
        .from("nutra_sales")
        .select("product_name, status")
        .eq("project_id", projectId)
        .in("status", NUTRA_APPROVED)
        .gte("created_at", startIso)
        .lte("created_at", endIso);
      if (error) throw error;
      const byProduct: Record<string, number> = {};
      (data || []).forEach((s) => {
        const name = s.product_name || "Sem nome";
        byProduct[name] = (byProduct[name] || 0) + 1;
      });
      return Object.entries(byProduct).map(([produto, vendas]) => ({ produto, vendas })).sort((a, b) => b.vendas - a.vendas);
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!projectId,
  });
}

export function usePreviousPeriodNutraKpis({ since, until, projectId }: NutraDashboardFilters) {
  return useQuery({
    queryKey: ["previous-period-nutra-kpis", since, until, projectId],
    queryFn: async () => {
      if (!projectId) return { previousRevenue: 0 };
      const days = differenceInDays(parseISO(until), parseISO(since)) + 1;
      const prevUntil = format(subDays(parseISO(since), 1), "yyyy-MM-dd");
      const prevSince = format(subDays(parseISO(since), days), "yyyy-MM-dd");
      const { startIso: prevStart, endIso: prevEnd } = brazilCivilRangeUtcIso(prevSince, prevUntil);
      const { data, error } = await supabase
        .from("nutra_sales")
        .select("amount, status")
        .eq("project_id", projectId)
        .in("status", NUTRA_APPROVED)
        .gte("created_at", prevStart)
        .lte("created_at", prevEnd);
      if (error) throw error;
      const revenue = (data || []).reduce((sum, s) => sum + Number(s.amount || 0), 0);
      return { previousRevenue: revenue };
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!projectId,
  });
}

export function useRecentLeads() {
  return useQuery({
    queryKey: ["recent-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("full_name, email, last_product, last_sale_status_enum, created_at")
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;

      return (data || []).map((lead) => ({
        name: lead.full_name || lead.email.split("@")[0],
        email: lead.email,
        product: lead.last_product || "–",
        status: lead.last_sale_status_enum || "novo",
        time: formatDistanceToNow(parseISO(lead.created_at), { locale: ptBR, addSuffix: false }),
      }));
    },
    staleTime: 2 * 60 * 1000,
  });
}
