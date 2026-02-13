import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Campaign {
  campaign_id: string;
  campaign_name: string;
  spend: string;
  clicks: string;
  impressions: string;
}

interface MetaCampaignsResponse {
  campaigns: Campaign[];
}

export function useMetaCampaigns({ since, until }: { since: string; until: string }) {
  return useQuery<MetaCampaignsResponse>({
    queryKey: ["meta-campaigns", since, until],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/meta-campaigns?since=${since}&until=${until}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to fetch campaigns");
      }

      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!since && !!until,
  });
}
