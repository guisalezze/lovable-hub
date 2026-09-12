import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProject } from "@/contexts/ProjectContext";
import type { MetricRow } from "@/lib/metaMetrics";

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

export function useAdPerformance(accountId?: string, since?: string, until?: string) {
  return useQuery({
    queryKey: ["ad-performance", accountId, since, until],
    queryFn: async () => {
      if (!accountId) return [];
      let query = supabase
        .from("ad_performance")
        .select("*")
        .eq("ad_account_id", accountId)
        .order("date", { ascending: false });
      if (since) query = query.gte("date", since);
      if (until) query = query.lte("date", until);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!accountId,
  });
}

export function useCampaignMetrics(accountId?: string, since?: string, until?: string) {
  return useQuery({
    queryKey: ["meta-campaign-metrics", accountId, since, until],
    queryFn: async (): Promise<MetricRow[]> => {
      if (!accountId) return [];
      let rawQuery = supabase.from("meta_campaigns").select("*").eq("ad_account_id", accountId);
      if (since) rawQuery = rawQuery.gte("date", since);
      if (until) rawQuery = rawQuery.lte("date", until);
      const { data: raw, error: rawErr } = await rawQuery;
      if (rawErr) throw rawErr;

      let perfQuery = supabase.from("campaign_performance").select("*").eq("ad_account_id", accountId);
      if (since) perfQuery = perfQuery.gte("date", since);
      if (until) perfQuery = perfQuery.lte("date", until);
      const { data: perf, error: perfErr } = await perfQuery;
      if (perfErr) throw perfErr;

      const perfMap = new Map((perf || []).map((p: any) => [`${p.campaign_uuid}-${p.date}`, p]));

      return (raw || []).map((c: any) => {
        const p: any = perfMap.get(`${c.id}-${c.date}`);
        return {
          id: c.id, graphId: c.campaign_id, name: c.campaign_name, status: c.status, date: c.date,
          spend: Number(c.spend || 0), impressions: Number(c.impressions || 0), clicks: Number(c.clicks || 0),
          initiate_checkout: Number(c.initiate_checkout || 0), video_view: Number(c.video_view || 0),
          video_plays: Number(c.video_plays || 0), video_p75_watched: Number(c.video_p75_watched || 0),
          follows: Number(c.follows || 0), bid_amount: c.bid_amount != null ? Number(c.bid_amount) : null,
          daily_budget: c.daily_budget != null ? Number(c.daily_budget) : null,
          lifetime_budget: c.lifetime_budget != null ? Number(c.lifetime_budget) : null,
          conversions: Number(p?.sales_count || 0), revenue: p ? Number(p.revenue || 0) : 0,
          cpa: p?.cpa != null ? Number(p.cpa) : null, roas: p?.roas != null ? Number(p.roas) : null,
          profit: p?.profit != null ? Number(p.profit) : (p ? 0 - Number(c.spend || 0) : null),
        };
      });
    },
    enabled: !!accountId,
  });
}

export function useAdsetMetrics(accountId?: string, since?: string, until?: string) {
  return useQuery({
    queryKey: ["meta-adset-metrics", accountId, since, until],
    queryFn: async (): Promise<MetricRow[]> => {
      if (!accountId) return [];
      let rawQuery = supabase
        .from("meta_adsets")
        .select("*, meta_campaigns!inner(ad_account_id, campaign_name)")
        .eq("meta_campaigns.ad_account_id", accountId);
      if (since) rawQuery = rawQuery.gte("date", since);
      if (until) rawQuery = rawQuery.lte("date", until);
      const { data: raw, error: rawErr } = await rawQuery;
      if (rawErr) throw rawErr;

      let perfQuery = supabase.from("adset_performance").select("*").eq("ad_account_id", accountId);
      if (since) perfQuery = perfQuery.gte("date", since);
      if (until) perfQuery = perfQuery.lte("date", until);
      const { data: perf, error: perfErr } = await perfQuery;
      if (perfErr) throw perfErr;

      const perfMap = new Map((perf || []).map((p: any) => [`${p.adset_uuid}-${p.date}`, p]));

      return (raw || []).map((a: any) => {
        const p: any = perfMap.get(`${a.id}-${a.date}`);
        return {
          id: a.id, graphId: a.adset_id, name: a.adset_name, status: a.status, date: a.date,
          campaignName: a.meta_campaigns?.campaign_name ?? null,
          spend: Number(a.spend || 0), impressions: Number(a.impressions || 0), clicks: Number(a.clicks || 0),
          initiate_checkout: Number(a.initiate_checkout || 0), video_view: Number(a.video_view || 0),
          video_plays: Number(a.video_plays || 0), video_p75_watched: Number(a.video_p75_watched || 0),
          follows: Number(a.follows || 0), bid_amount: a.bid_amount != null ? Number(a.bid_amount) : null,
          daily_budget: a.daily_budget != null ? Number(a.daily_budget) : null,
          lifetime_budget: a.lifetime_budget != null ? Number(a.lifetime_budget) : null,
          conversions: Number(p?.sales_count || 0), revenue: p ? Number(p.revenue || 0) : 0,
          cpa: p?.cpa != null ? Number(p.cpa) : null, roas: p?.roas != null ? Number(p.roas) : null,
          profit: p?.profit != null ? Number(p.profit) : (p ? 0 - Number(a.spend || 0) : null),
        };
      });
    },
    enabled: !!accountId,
  });
}

export function useAdMetrics(accountId?: string, since?: string, until?: string) {
  return useQuery({
    queryKey: ["meta-ad-metrics", accountId, since, until],
    queryFn: async (): Promise<MetricRow[]> => {
      if (!accountId) return [];
      let rawQuery = supabase
        .from("meta_ads")
        .select("*, meta_adsets!inner(adset_name, meta_campaigns!inner(ad_account_id, campaign_name))")
        .eq("meta_adsets.meta_campaigns.ad_account_id", accountId);
      if (since) rawQuery = rawQuery.gte("date", since);
      if (until) rawQuery = rawQuery.lte("date", until);
      const { data: raw, error: rawErr } = await rawQuery;
      if (rawErr) throw rawErr;

      let perfQuery = supabase.from("ad_performance").select("*").eq("ad_account_id", accountId);
      if (since) perfQuery = perfQuery.gte("date", since);
      if (until) perfQuery = perfQuery.lte("date", until);
      const { data: perf, error: perfErr } = await perfQuery;
      if (perfErr) throw perfErr;

      const perfMap = new Map((perf || []).map((p: any) => [`${p.ad_id}-${p.date}`, p]));

      return (raw || []).map((a: any) => {
        const p: any = perfMap.get(`${a.ad_id}-${a.date}`);
        return {
          id: a.id, graphId: a.ad_id, name: a.ad_name, status: a.status, date: a.date,
          adsetName: a.meta_adsets?.adset_name ?? null,
          campaignName: a.meta_adsets?.meta_campaigns?.campaign_name ?? null,
          spend: Number(a.spend || 0), impressions: Number(a.impressions || 0), clicks: Number(a.clicks || 0),
          initiate_checkout: Number(a.initiate_checkout || 0), video_view: Number(a.video_view || 0),
          video_plays: Number(a.video_plays || 0), video_p75_watched: Number(a.video_p75_watched || 0),
          follows: Number(a.follows || 0), bid_amount: null,
          daily_budget: null, lifetime_budget: null,
          conversions: Number(p?.sales_count || 0), revenue: p ? Number(p.revenue || 0) : 0,
          cpa: p?.cpa != null ? Number(p.cpa) : null, roas: p?.roas != null ? Number(p.roas) : null,
          profit: p?.profit != null ? Number(p.profit) : (p ? 0 - Number(a.spend || 0) : null),
        };
      });
    },
    enabled: !!accountId,
  });
}

export function useUpdateBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { level: "campaign" | "adset"; id: string; budget_type: "daily" | "lifetime"; value: number }) => {
      const res = await supabase.functions.invoke("meta-action", {
        body: { action: "budget", ...params },
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: (_data, variables) => {
      // meta-action only writes to the Meta Graph API, not our DB — the next scheduled
      // meta-sync run (up to 20 min later) is what actually persists this. Patch the
      // cache directly with the value we just set instead of invalidating (which would
      // refetch the still-stale DB row and make the edit look like it silently failed).
      const queryKeyPrefix = variables.level === "campaign" ? "meta-campaign-metrics" : "meta-adset-metrics";
      qc.setQueriesData<MetricRow[]>({ queryKey: [queryKeyPrefix] }, (old) => {
        if (!old) return old;
        return old.map((row) =>
          row.graphId === variables.id
            ? {
                ...row,
                ...(variables.budget_type === "daily"
                  ? { daily_budget: variables.value }
                  : { lifetime_budget: variables.value }),
              }
            : row
        );
      });
    },
  });
}
