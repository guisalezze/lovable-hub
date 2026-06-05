import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { brazilCivilRangeUtcIso, isApprovedSaleStatus } from "@/hooks/useDashboardData";

export function useProductGoals(since: string, until: string) {
  return useQuery({
    queryKey: ["product-goals", since, until],
    queryFn: async () => {
      const { data: goals, error } = await supabase
        .from("product_goals" as any)
        .select("*")
        .lte("period_start", until)
        .gte("period_end", since);
      if (error) throw error;

      const { startIso, endIso } = brazilCivilRangeUtcIso(since, until);
      const { data: salesRaw } = await supabase
        .from("sales")
        .select("product_name, sale_amount, sale_status_enum")
        .gte("created_at", startIso)
        .lte("created_at", endIso);

      const sales = (salesRaw || []).filter((s) => isApprovedSaleStatus(s.sale_status_enum));

      const revenueByProduct: Record<string, number> = {};
      sales.forEach((s: any) => {
        const p = s.product_name || "Outros";
        revenueByProduct[p] = (revenueByProduct[p] || 0) + Number(s.sale_amount || 0);
      });

      return ((goals as any[]) || []).map((g: any) => ({
        ...g,
        current: revenueByProduct[g.product_name] || 0,
        pct: Math.min(100, Math.round(((revenueByProduct[g.product_name] || 0) / g.goal_amount) * 100)),
      }));
    },
    staleTime: 60_000,
  });
}

export function useProductsList() {
  return useQuery({
    queryKey: ["products-list"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name");
      return data || [];
    },
    staleTime: Infinity,
  });
}

export function useUpsertProductGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (goal: { product_name: string; product_id?: string; goal_amount: number; period_start: string; period_end: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("product_goals" as any).insert({ ...goal, created_by: user?.id } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product-goals"] }),
  });
}

export function useDeleteProductGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_goals" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product-goals"] }),
  });
}
