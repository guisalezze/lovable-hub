import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface DailySpend {
  date_start: string;
  spend: string;
}

interface MetaSpendResponse {
  total_spend: number;
  daily: DailySpend[];
}

export function useMetaSpend({ since, until }: { since: string; until: string }) {
  return useQuery<MetaSpendResponse>({
    queryKey: ["meta-spend", since, until],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/meta-spend?since=${since}&until=${until}`,
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
    enabled: !!since && !!until,
  });
}
