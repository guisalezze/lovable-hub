import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, parseISO, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface DashboardFilters {
  since: string;
  until: string;
}

export function useDashboardKpis({ since, until }: DashboardFilters) {
  return useQuery({
    queryKey: ["dashboard-kpis", since, until],
    queryFn: async () => {
      const { data: sales, error } = await supabase
        .from("sales")
        .select("sale_amount, sale_status_enum, date_created")
        .gte("date_created", `${since}T00:00:00`)
        .lte("date_created", `${until}T23:59:59`);

      if (error) throw error;

      const approved = sales?.filter((s) => s.sale_status_enum === "approved") || [];
      const pending = sales?.filter((s) => s.sale_status_enum === "pending" || s.sale_status_enum === "in_process" || s.sale_status_enum === "in_review") || [];
      const refunded = sales?.filter((s) => s.sale_status_enum === "refunded" || s.sale_status_enum === "pre_refunded") || [];
      const chargebacks = sales?.filter((s) => s.sale_status_enum === "charged_back" || s.sale_status_enum === "pre_chargeback") || [];

      const revenue = approved.reduce((sum, s) => sum + Number(s.sale_amount || 0), 0);

      return {
        revenue,
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
        .select("sale_amount, sale_status_enum, date_created")
        .eq("sale_status_enum", "approved")
        .gte("date_created", `${since}T00:00:00`)
        .lte("date_created", `${until}T23:59:59`);

      if (error) throw error;

      const byDay: Record<string, number> = {};
      sales?.forEach((s) => {
        if (s.date_created) {
          const day = format(parseISO(s.date_created), "dd/MM");
          byDay[day] = (byDay[day] || 0) + Number(s.sale_amount || 0);
        }
      });

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
        .gte("date_created", `${since}T00:00:00`)
        .lte("date_created", `${until}T23:59:59`);

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
