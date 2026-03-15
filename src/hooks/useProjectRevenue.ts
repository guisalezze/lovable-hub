import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProject } from "@/contexts/ProjectContext";

/** Faturamento acumulado total: vendas aprovadas + mentorias (paid_amount) — separado por projeto */
export function useProjectRevenueTotal() {
  const { currentProject } = useProject();
  const qc = useQueryClient();

  const isNutra = currentProject?.slug === "nutra";

  const query = useQuery({
    queryKey: ["project-revenue-total", currentProject?.id],
    queryFn: async () => {
      if (!currentProject) return { sales: 0, mentorias: 0, total: 0 };

      let salesTotal = 0;
      let mentoriasTotal = 0;

      if (isNutra) {
        // Nutra — tabela nutra_sales, filtrada por project_id (acumulado total)
        const { data: nutraData } = await supabase
          .from("nutra_sales")
          .select("amount")
          .eq("project_id", currentProject.id)
          .eq("status", "approved");

        salesTotal = (nutraData || []).reduce(
          (acc, s) => acc + Number(s.amount || 0),
          0
        );
        // Nutra não tem mentorias
        mentoriasTotal = 0;
      } else {
        // Educacional — tabela sales (acumulado total, sem filtro de data)
        const { data: salesData } = await supabase
          .from("sales")
          .select("sale_amount")
          .eq("sale_status_enum", "approved");

        salesTotal = (salesData || []).reduce(
          (acc, s) => acc + Number(s.sale_amount || 0),
          0
        );

        // Mentorias/Implementações — paid_amount registrado (só Educacional)
        const { data: implData } = await (supabase as any)
          .from("implementations")
          .select("paid_amount");

        mentoriasTotal = (implData || []).reduce(
          (acc: number, i: any) => acc + Number(i.paid_amount || 0),
          0
        );
      }

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
