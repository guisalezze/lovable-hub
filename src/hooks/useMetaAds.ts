import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProject } from "@/contexts/ProjectContext";

/** Verifica se o projeto tem uma conta Meta Ads configurada (via meta_ad_accounts OU via app_settings legado) */
export function useMetaConnection() {
  const { currentProject } = useProject();
  return useQuery({
    queryKey: ["meta-connection", currentProject?.id],
    queryFn: async () => {
      if (!currentProject) return { configured: false, account_id: null, account_name: null };
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { configured: false, account_id: null, account_name: null };
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-ads-config?project_id=${currentProject.id}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      if (!res.ok) return { configured: false, account_id: null, account_name: null };
      return res.json() as Promise<{ configured: boolean; meta_ads_account_id: string | null; account_name: string | null }>;
    },
    enabled: !!currentProject,
    staleTime: 30_000,
  });
}

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
