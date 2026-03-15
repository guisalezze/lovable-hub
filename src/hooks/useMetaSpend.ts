import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProject } from "@/contexts/ProjectContext";

interface DailySpend {
  date_start: string;
  spend_brl: string;
  spend_usd: string;
}

interface MetaSpendResponse {
  total_spend: number;
  daily: DailySpend[];
  account_id?: string;
  account_name?: string;
}

export function useMetaSpend({ since, until }: { since: string; until: string }) {
  const { currentProject } = useProject();

  return useQuery<MetaSpendResponse>({
    queryKey: ["meta-spend", currentProject?.id, since, until],
    queryFn: async () => {
      // Refresh session to avoid expired JWT
      const { data: { session }, error: sessionError } = await supabase.auth.refreshSession();
      if (sessionError || !session) throw new Error("Not authenticated");

      const projectParam = currentProject?.id
        ? `&project_id=${currentProject.id}`
        : "";

      const res = await fetch(
        `https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/meta-spend?since=${since}&until=${until}${projectParam}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to fetch meta spend");
      }

      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!since && !!until && !!currentProject,
  });
}
