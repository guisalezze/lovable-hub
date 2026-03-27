import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, parseISO, formatDistanceToNow, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

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
      // Filtra por date_approved (data real do pagamento), não date_created (início do checkout)
      const { data: sales, error } = await supabase
        .from("sales")
        .select("sale_amount, sale_status_enum, date_approved, date_created")
        .gte("date_approved", `${since}T00:00:00`)
        .lte("date_approved", `${until}T23:59:59`);

      if (error) throw error;

      const approved = sales?.filter((s) => s.sale_status_enum === "approved") || [];
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
      const { data: sales, error } = await supabase
        .from("sales")
        .select("sale_amount, sale_status_enum, date_approved")
        .eq("sale_status_enum", "approved")
        .gte("date_approved", `${since}T00:00:00`)
        .lte("date_approved", `${until}T23:59:59`);

      if (error) throw error;

      const byDay: Record<string, number> = {};
      sales?.forEach((s) => {
        if (s.date_approved) {
          const day = format(parseISO(s.date_approved), "dd/MM");
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
            const day = format(parseISO(i.contract_start), "dd/MM");
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
      const { data: sales, error } = await supabase
        .from("sales")
        .select("product_name, sale_status_enum")
        .eq("sale_status_enum", "approved")
        .gte("date_approved", `${since}T00:00:00`)
        .lte("date_approved", `${until}T23:59:59`);

      if (error) throw error;

      const byProduct: Record<string, number> = {};
      sales?.forEach((s) => {
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

      const { data: sales, error } = await supabase
        .from("sales")
        .select("sale_amount, sale_status_enum, date_approved")
        .gte("date_approved", `${prevSince}T00:00:00`)
        .lte("date_approved", `${prevUntil}T23:59:59`);

      if (error) throw error;

      const approved = sales?.filter((s) => s.sale_status_enum === "approved") || [];
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
      const { data, error } = await supabase
        .from("nutra_sales")
        .select("amount, status")
        .eq("project_id", projectId)
        .gte("created_at", `${since}T00:00:00`)
        .lte("created_at", `${until}T23:59:59`);
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
      const { data, error } = await supabase
        .from("nutra_sales")
        .select("amount, status, created_at")
        .eq("project_id", projectId)
        .in("status", NUTRA_APPROVED)
        .gte("created_at", `${since}T00:00:00`)
        .lte("created_at", `${until}T23:59:59`);
      if (error) throw error;
      const byDay: Record<string, number> = {};
      (data || []).forEach((s) => {
        if (s.created_at) {
          const day = format(parseISO(s.created_at), "dd/MM");
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
      const { data, error } = await supabase
        .from("nutra_sales")
        .select("product_name, status")
        .eq("project_id", projectId)
        .in("status", NUTRA_APPROVED)
        .gte("created_at", `${since}T00:00:00`)
        .lte("created_at", `${until}T23:59:59`);
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
      const { data, error } = await supabase
        .from("nutra_sales")
        .select("amount, status")
        .eq("project_id", projectId)
        .in("status", NUTRA_APPROVED)
        .gte("created_at", `${prevSince}T00:00:00`)
        .lte("created_at", `${prevUntil}T23:59:59`);
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
