import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProject } from "@/contexts/ProjectContext";

export function useMetaAdAccounts() {
  const { currentProject } = useProject();
  return useQuery({
    queryKey: ["meta-ad-accounts", currentProject?.id],
    queryFn: async () => {
      if (!currentProject) return [];
      // Filtra estritamente por project_id — cada projeto tem sua própria conta
      const { data, error } = await supabase
        .from("meta_ad_accounts")
        .select("*")
        .eq("project_id", currentProject.id)
        .eq("is_active", true)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentProject,
  });
}

export function useMetaAdCampaigns(accountId?: string, since?: string, until?: string) {
  return useQuery({
    queryKey: ["meta-ad-campaigns", accountId, since, until],
    queryFn: async () => {
      if (!accountId) return [];
      let query = supabase
        .from("meta_campaigns")
        .select("*")
        .eq("ad_account_id", accountId)
        .order("spend", { ascending: false });
      if (since) query = query.gte("date", since);
      if (until) query = query.lte("date", until);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!accountId,
  });
}

export function useMetaRules(accountId?: string) {
  return useQuery({
    queryKey: ["meta-rules", accountId],
    queryFn: async () => {
      if (!accountId) return [];
      const { data, error } = await supabase
        .from("meta_rules")
        .select("*")
        .eq("ad_account_id", accountId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!accountId,
  });
}

export function useSyncMetaAds() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (accountId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const res = await supabase.functions.invoke("meta-sync", {
        body: { ad_account_id: accountId },
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meta-ad-campaigns"] });
    },
  });
}

export function useMetaAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { action: string; campaign_id: string; value?: string }) => {
      const res = await supabase.functions.invoke("meta-action", {
        body: params,
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meta-ad-campaigns"] });
    },
  });
}

export function useNutraSales(since?: string, until?: string) {
  const { currentProject } = useProject();
  return useQuery({
    queryKey: ["nutra-sales", currentProject?.id, since, until],
    queryFn: async () => {
      if (!currentProject) return [];
      let query = supabase
        .from("nutra_sales")
        .select("*")
        .eq("project_id", currentProject.id)
        .order("created_at", { ascending: false });
      if (since) query = query.gte("created_at", `${since}T00:00:00`);
      if (until) query = query.lte("created_at", `${until}T23:59:59`);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentProject,
  });
}
