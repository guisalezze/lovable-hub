import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useRevenueGoal() {
  return useQuery<number>({
    queryKey: ["revenue-goal"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "revenue_goal")
        .maybeSingle();
      return data?.value ? Number(data.value) : 0;
    },
    staleTime: 60_000,
  });
}

export function useSetRevenueGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (goal: number) => {
      const { error } = await supabase
        .from("app_settings")
        .upsert({ key: "revenue_goal", value: goal, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["revenue-goal"] }),
  });
}
