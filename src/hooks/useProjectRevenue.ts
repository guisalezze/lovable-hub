import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProject } from "@/contexts/ProjectContext";
import { startOfMonth, endOfMonth, format } from "date-fns";

/** Faturamento total do mês atual: vendas aprovadas + mentorias (paid_amount) */
export function useProjectRevenueTotal() {
  const { currentProject } = useProject();
  const qc = useQueryClient();

  const since = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const until = format(endOfMonth(new Date()), "yyyy-MM-dd");

  const query = useQuery({
    queryKey: ["project-revenue-total", currentProject?.id, since, until],
    queryFn: async () => {
      if (!currentProject) return { sales: 0, mentorias: 0, total: 0 };

      // 1. Vendas aprovadas do projeto no mês
      const { data: salesData } = await supabase
        .from("sales")
        .select("sale_amount")
        .eq("sale_status_enum", "approved")
        .gte("created_at", `${since}T00:00:00`)
        .lte("created_at", `${until}T23:59:59`);

      const salesTotal = (salesData || []).reduce(
        (acc, s) => acc + Number(s.sale_amount || 0),
        0
      );

      // 2. Mentorias/Implementações — paid_amount registrado
      const { data: implData } = await (supabase as any)
        .from("implementations")
        .select("paid_amount");

      const mentoriasTotal = (implData || []).reduce(
        (acc: number, i: any) => acc + Number(i.paid_amount || 0),
        0
      );

      return {
        sales: salesTotal,
        mentorias: mentoriasTotal,
        total: salesTotal + mentoriasTotal,
      };
    },
    staleTime: 60_000,
    enabled: !!currentProject,
  });

  // Realtime: atualiza quando sales ou implementations mudarem
  useEffect(() => {
    if (!currentProject) return;

    const salesChannel = supabase
      .channel(`revenue-sales-${currentProject.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sales" },
        () => qc.invalidateQueries({ queryKey: ["project-revenue-total"] })
      )
      .subscribe();

    const implChannel = supabase
      .channel(`revenue-impl-${currentProject.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "implementations" },
        () => qc.invalidateQueries({ queryKey: ["project-revenue-total"] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(salesChannel);
      supabase.removeChannel(implChannel);
    };
  }, [currentProject, qc]);

  return query;
}

/** Meta de faturamento por projeto */
export function useProjectRevenueGoal() {
  const { currentProject } = useProject();
  return useQuery<number>({
    queryKey: ["revenue-goal", currentProject?.id],
    queryFn: async () => {
      if (!currentProject) return 0;
      const key = `revenue_goal_${currentProject.id}`;
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", key)
        .maybeSingle();
      return data?.value ? Number(data.value) : 0;
    },
    staleTime: 60_000,
    enabled: !!currentProject,
  });
}

export function useSetProjectRevenueGoal() {
  const qc = useQueryClient();
  const { currentProject } = useProject();
  return useMutation({
    mutationFn: async (goal: number) => {
      if (!currentProject) return;
      const key = `revenue_goal_${currentProject.id}`;
      const { error } = await supabase
        .from("app_settings")
        .upsert(
          { key, value: goal, updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["revenue-goal", currentProject?.id] }),
  });
}
