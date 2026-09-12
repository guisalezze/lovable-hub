# Meta Ads Extended Metrics + Budget Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the `/meta-ads` "Campanhas" tab a level selector (Campanha/Conjunto/Anúncio), a UTMify-style customizable column picker covering funnel and video-engagement metrics, and a working budget-editing modal (daily/lifetime) — using data `meta-sync` doesn't pull yet.

**Architecture:** `meta-sync` gains a few more Graph API insight fields (video engagement, initiate-checkout) and object fields (bid, lifetime budget for adsets), stored in new columns on the existing three `meta_*` tables. Two new rollup views (`campaign_performance`, `adset_performance`) sum the existing `ad_performance` view's sale-linked revenue up to campaign/adset grain, mirroring its own pattern. A shared metric catalog (`src/lib/metaMetrics.ts`) is the single source of truth for what each metric means and how it's formatted, consumed by both the column-picker checkboxes and the table renderer. `meta-action`'s `budget` case becomes level-aware (campaign or adset) and type-aware (daily or lifetime).

**Tech Stack:** Same as the prior Meta Ads attribution project — Supabase Postgres + Deno Edge Functions, React + TanStack Query + shadcn/ui (`Popover`, `Checkbox`, `Dialog`, `RadioGroup`, `ToggleGroup` — all already present in this repo's `src/components/ui/`).

**Spec:** `docs/superpowers/specs/2026-09-12-meta-ads-extended-metrics-design.md`

## Global Constraints

- No test framework exists in this repo — every task's verification is a concrete manual command (SQL query, curl, or `npm run build`/`tsc --noEmit`), not a unit test file.
- Follow existing edge function conventions: no shared `_shared/` module, each `index.ts` self-contained.
- All new/changed Supabase objects go through `supabase/migrations/*.sql`, applied via `npx supabase db push --linked --yes` from `lovable-hub-1/` (project already linked to `lqrlvefeznfaauwgvubl`).
- `functions deploy`/`secrets set`/`secrets list` do NOT take `--linked` on this CLI version (it's rejected); `db push`/`db query` DO need `--linked`.
- Money formatting always via `Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })`, matching every existing money display in this codebase.
- Divide-by-zero / missing data always renders `"–"`, matching the existing `Atribuição` tab's convention — never `NaN`, `Infinity`, or a blank cell.
- Non-goals (do not build): ICR/CON metrics (depend on untracked PageView pixel event), a DB-backed per-user column preference (localStorage only), editing anything besides budget, hierarchical drill-down navigation between levels.

---

### Task 1: Database — new metric columns + campaign/adset performance rollup views

**Files:**
- Create: `supabase/migrations/20260912000001_meta_extended_metrics_schema.sql`

**Interfaces:**
- Produces: `meta_campaigns`/`meta_adsets`/`meta_ads` gain `initiate_checkout`, `video_view`, `video_plays`, `video_p75_watched`, `follows bigint default 0` each; `meta_campaigns`/`meta_adsets` also gain `bid_amount numeric`; `meta_adsets` also gains `lifetime_budget numeric`.
- Produces: views `public.campaign_performance` and `public.adset_performance` (columns: `campaign_uuid`/`adset_uuid`, `campaign_id`/`adset_id` (Meta text ID), `campaign_name`/`adset_name`, `ad_account_id`, `date`, `spend`, `impressions`, `clicks`, `sales_count`, `revenue`, `cpa`, `roas`, `profit`) — same shape/semantics as the existing `ad_performance` view, rolled up one level.
- Consumes: `public.ad_performance` (prior project), `meta_ads`/`meta_adsets`/`meta_campaigns` (prior project).

- [ ] **Step 1: Write the migration**

```sql
ALTER TABLE public.meta_campaigns
  ADD COLUMN initiate_checkout bigint DEFAULT 0,
  ADD COLUMN video_view bigint DEFAULT 0,
  ADD COLUMN video_plays bigint DEFAULT 0,
  ADD COLUMN video_p75_watched bigint DEFAULT 0,
  ADD COLUMN follows bigint DEFAULT 0,
  ADD COLUMN bid_amount numeric;

ALTER TABLE public.meta_adsets
  ADD COLUMN initiate_checkout bigint DEFAULT 0,
  ADD COLUMN video_view bigint DEFAULT 0,
  ADD COLUMN video_plays bigint DEFAULT 0,
  ADD COLUMN video_p75_watched bigint DEFAULT 0,
  ADD COLUMN follows bigint DEFAULT 0,
  ADD COLUMN bid_amount numeric,
  ADD COLUMN lifetime_budget numeric;

ALTER TABLE public.meta_ads
  ADD COLUMN initiate_checkout bigint DEFAULT 0,
  ADD COLUMN video_view bigint DEFAULT 0,
  ADD COLUMN video_plays bigint DEFAULT 0,
  ADD COLUMN video_p75_watched bigint DEFAULT 0,
  ADD COLUMN follows bigint DEFAULT 0;

-- Rollup: sum ad_performance's sale-linked revenue up to adset grain. Same INNER JOIN
-- shape ad_performance itself uses — every (ad_id, date) with spend already has a row
-- in ad_performance (revenue defaults to 0 via COALESCE there), so this never silently
-- drops a spend row the way a naive filter could.
CREATE OR REPLACE VIEW public.adset_performance AS
SELECT
  mas.id AS adset_uuid,
  mas.adset_id,
  mas.adset_name,
  mc.id AS campaign_uuid,
  mc.campaign_name,
  mc.ad_account_id,
  ap.date,
  SUM(ap.spend) AS spend,
  SUM(ap.impressions) AS impressions,
  SUM(ap.clicks) AS clicks,
  SUM(ap.sales_count) AS sales_count,
  SUM(ap.revenue) AS revenue,
  CASE WHEN SUM(ap.sales_count) > 0 THEN SUM(ap.spend) / SUM(ap.sales_count) ELSE NULL END AS cpa,
  CASE WHEN SUM(ap.spend) > 0 THEN SUM(ap.revenue) / SUM(ap.spend) ELSE NULL END AS roas,
  SUM(ap.revenue) - SUM(ap.spend) AS profit
FROM public.ad_performance ap
JOIN public.meta_ads ma ON ma.ad_id = ap.ad_id AND ma.date = ap.date
JOIN public.meta_adsets mas ON mas.id = ma.adset_id
JOIN public.meta_campaigns mc ON mc.id = mas.campaign_id
GROUP BY mas.id, mas.adset_id, mas.adset_name, mc.id, mc.campaign_name, mc.ad_account_id, ap.date;

GRANT SELECT ON public.adset_performance TO authenticated;

CREATE OR REPLACE VIEW public.campaign_performance AS
SELECT
  mc.id AS campaign_uuid,
  mc.campaign_id,
  mc.campaign_name,
  mc.ad_account_id,
  ap.date,
  SUM(ap.spend) AS spend,
  SUM(ap.impressions) AS impressions,
  SUM(ap.clicks) AS clicks,
  SUM(ap.sales_count) AS sales_count,
  SUM(ap.revenue) AS revenue,
  CASE WHEN SUM(ap.sales_count) > 0 THEN SUM(ap.spend) / SUM(ap.sales_count) ELSE NULL END AS cpa,
  CASE WHEN SUM(ap.spend) > 0 THEN SUM(ap.revenue) / SUM(ap.spend) ELSE NULL END AS roas,
  SUM(ap.revenue) - SUM(ap.spend) AS profit
FROM public.ad_performance ap
JOIN public.meta_ads ma ON ma.ad_id = ap.ad_id AND ma.date = ap.date
JOIN public.meta_adsets mas ON mas.id = ma.adset_id
JOIN public.meta_campaigns mc ON mc.id = mas.campaign_id
GROUP BY mc.id, mc.campaign_id, mc.campaign_name, mc.ad_account_id, ap.date;

GRANT SELECT ON public.campaign_performance TO authenticated;
```

- [ ] **Step 2: Apply**

Run: `cd lovable-hub-1 && npx supabase db push --linked --yes`
Expected: `"Finished supabase db push."`

- [ ] **Step 3: Verify**

Save as a scratch `.sql` file and run via `npx supabase db query --linked --file`:
```sql
select column_name from information_schema.columns where table_name = 'meta_campaigns' and column_name in ('initiate_checkout','video_view','video_plays','video_p75_watched','follows','bid_amount');
select column_name from information_schema.columns where table_name = 'meta_adsets' and column_name in ('lifetime_budget','bid_amount');
select 1 from pg_views where viewname in ('campaign_performance','adset_performance');
```
Expected: first query returns 6 rows, second returns 2 rows, third returns 2 rows.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260912000001_meta_extended_metrics_schema.sql
git commit -m "feat(db): add extended Meta Ads metric columns and campaign/adset performance rollup views"
git push origin HEAD
```

---

### Task 2: `meta-sync` — pull the new metrics

**Files:**
- Modify: `supabase/functions/meta-sync/index.ts` (full rewrite of `syncAccount`, same file)

**Interfaces:**
- Consumes: Task 1's new columns
- Produces: unchanged HTTP contract (`{ad_account_id}` or `{}` body) — same as the prior project's Task 4

- [ ] **Step 1: Replace `syncAccount` and the campaign/adset/ad object-fetch calls**

```typescript
// supabase/functions/meta-sync/index.ts
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://crm.guisalezze.com",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const INSIGHTS_FIELDS = "spend,impressions,clicks,actions,video_play_actions,video_p75_watched_actions";
const PURCHASE_TYPES = ["offsite_conversion.fb_pixel_purchase", "purchase"];
const INITIATE_CHECKOUT_TYPES = ["initiate_checkout", "omni_initiated_checkout", "offsite_conversion.fb_pixel_initiate_checkout"];
const VIDEO_VIEW_TYPES = ["video_view"];
const FOLLOW_TYPES = ["onsite_conversion.follow"];

function sumActionTypes(actions: any[] | undefined, types: string[]): number {
  return (actions || [])
    .filter((a: any) => types.includes(a.action_type))
    .reduce((s: number, a: any) => s + Number(a.value || 0), 0);
}

function sumAll(actions: any[] | undefined): number {
  return (actions || []).reduce((s: number, a: any) => s + Number(a.value || 0), 0);
}

function extractInsightMetrics(day: any) {
  return {
    conversions: sumActionTypes(day.actions, PURCHASE_TYPES),
    initiateCheckout: sumActionTypes(day.actions, INITIATE_CHECKOUT_TYPES),
    videoView: sumActionTypes(day.actions, VIDEO_VIEW_TYPES),
    follows: sumActionTypes(day.actions, FOLLOW_TYPES),
    videoPlays: sumAll(day.video_play_actions),
    videoP75Watched: sumAll(day.video_p75_watched_actions),
  };
}

async function syncAccount(adminClient: any, account: any) {
  const token = account.access_token;
  const actId = `act_${account.account_id}`;
  const today = new Date().toISOString().split("T")[0];
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const campaignsRes = await fetch(
    `https://graph.facebook.com/v21.0/${actId}/campaigns?fields=name,status,objective,daily_budget,lifetime_budget,bid_amount&limit=100&access_token=${token}`
  );
  const campaignsData = await campaignsRes.json();
  if (campaignsData.error) {
    console.error(`meta-sync: account ${account.id} campaigns error`, campaignsData.error);
    return { account_id: account.id, error: campaignsData.error.message };
  }

  let syncedCampaigns = 0, syncedAdsets = 0, syncedAds = 0;

  for (const campaign of (campaignsData.data || [])) {
    const insightsRes = await fetch(
      `https://graph.facebook.com/v21.0/${campaign.id}/insights?fields=${INSIGHTS_FIELDS}&time_range={"since":"${since}","until":"${today}"}&time_increment=1&access_token=${token}`
    );
    const insightsData = await insightsRes.json();

    for (const day of (insightsData.data || [])) {
      const m = extractInsightMetrics(day);

      const { data: campaignRow, error: campaignErr } = await adminClient
        .from("meta_campaigns")
        .upsert({
          ad_account_id: account.id,
          campaign_id: campaign.id,
          campaign_name: campaign.name,
          status: campaign.status,
          objective: campaign.objective,
          daily_budget: campaign.daily_budget ? Number(campaign.daily_budget) / 100 : null,
          lifetime_budget: campaign.lifetime_budget ? Number(campaign.lifetime_budget) / 100 : null,
          bid_amount: campaign.bid_amount ? Number(campaign.bid_amount) / 100 : null,
          spend: Number(day.spend || 0),
          impressions: Number(day.impressions || 0),
          clicks: Number(day.clicks || 0),
          conversions: m.conversions,
          initiate_checkout: m.initiateCheckout,
          video_view: m.videoView,
          video_plays: m.videoPlays,
          video_p75_watched: m.videoP75Watched,
          follows: m.follows,
          date: day.date_start,
        }, { onConflict: "ad_account_id,campaign_id,date" })
        .select("id")
        .single();

      if (campaignErr || !campaignRow) {
        console.error("meta-sync: campaign upsert failed", campaignErr);
        continue;
      }
      syncedCampaigns++;

      const adsetsRes = await fetch(
        `https://graph.facebook.com/v21.0/${campaign.id}/adsets?fields=name,status,daily_budget,lifetime_budget,bid_amount&limit=100&access_token=${token}`
      );
      const adsetsData = await adsetsRes.json();
      if (adsetsData.error) continue;

      for (const adset of (adsetsData.data || [])) {
        const adsetInsightsRes = await fetch(
          `https://graph.facebook.com/v21.0/${adset.id}/insights?fields=${INSIGHTS_FIELDS}&time_range={"since":"${day.date_start}","until":"${day.date_start}"}&access_token=${token}`
        );
        const adsetInsightsData = await adsetInsightsRes.json();
        const adsetDay = (adsetInsightsData.data || [])[0];
        if (!adsetDay) continue;

        const am = extractInsightMetrics(adsetDay);

        const { data: adsetRow, error: adsetErr } = await adminClient
          .from("meta_adsets")
          .upsert({
            campaign_id: campaignRow.id,
            adset_id: adset.id,
            adset_name: adset.name,
            status: adset.status,
            daily_budget: adset.daily_budget ? Number(adset.daily_budget) / 100 : null,
            lifetime_budget: adset.lifetime_budget ? Number(adset.lifetime_budget) / 100 : null,
            bid_amount: adset.bid_amount ? Number(adset.bid_amount) / 100 : null,
            spend: Number(adsetDay.spend || 0),
            impressions: Number(adsetDay.impressions || 0),
            clicks: Number(adsetDay.clicks || 0),
            conversions: am.conversions,
            initiate_checkout: am.initiateCheckout,
            video_view: am.videoView,
            video_plays: am.videoPlays,
            video_p75_watched: am.videoP75Watched,
            follows: am.follows,
            date: day.date_start,
          }, { onConflict: "campaign_id,adset_id,date" })
          .select("id")
          .single();

        if (adsetErr || !adsetRow) {
          console.error("meta-sync: adset upsert failed", adsetErr);
          continue;
        }
        syncedAdsets++;

        const adsRes = await fetch(
          `https://graph.facebook.com/v21.0/${adset.id}/ads?fields=name,status,creative{thumbnail_url}&limit=100&access_token=${token}`
        );
        const adsData = await adsRes.json();
        if (adsData.error) continue;

        for (const ad of (adsData.data || [])) {
          const adInsightsRes = await fetch(
            `https://graph.facebook.com/v21.0/${ad.id}/insights?fields=${INSIGHTS_FIELDS}&time_range={"since":"${day.date_start}","until":"${day.date_start}"}&access_token=${token}`
          );
          const adInsightsData = await adInsightsRes.json();
          const adDay = (adInsightsData.data || [])[0];
          if (!adDay) continue;

          const adm = extractInsightMetrics(adDay);

          const { error: adErr } = await adminClient.from("meta_ads").upsert({
            adset_id: adsetRow.id,
            ad_id: ad.id,
            ad_name: ad.name,
            status: ad.status,
            creative_thumbnail_url: ad.creative?.thumbnail_url ?? null,
            spend: Number(adDay.spend || 0),
            impressions: Number(adDay.impressions || 0),
            clicks: Number(adDay.clicks || 0),
            conversions: adm.conversions,
            initiate_checkout: adm.initiateCheckout,
            video_view: adm.videoView,
            video_plays: adm.videoPlays,
            video_p75_watched: adm.videoP75Watched,
            follows: adm.follows,
            date: day.date_start,
          }, { onConflict: "adset_id,ad_id,date" });

          if (adErr) console.error("meta-sync: ad upsert failed", adErr);
          else syncedAds++;
        }
      }
    }
  }

  return { account_id: account.id, synced_campaigns: syncedCampaigns, synced_adsets: syncedAdsets, synced_ads: syncedAds };
}
```
(The `Deno.serve` handler below `syncAccount` is unchanged — leave it exactly as-is; only `syncAccount` and the constants above it are replaced.)

- [ ] **Step 2: Deploy**

Run: `cd lovable-hub-1 && npx supabase functions deploy meta-sync` (no `--linked`)
Expected: deploy succeeds.

- [ ] **Step 3: Verify**

Get a real `ad_account_id`: `npx supabase db query --linked` with `select id from public.meta_ad_accounts where is_active = true limit 1;`. Then:
```bash
curl -sS -X POST "https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/meta-sync" -H "Content-Type: application/json" -d '{"ad_account_id":"<the-id>"}'
```
Expected: `{"success":true,"results":[{"account_id":"...",...}]}` with no `error`. Then `select initiate_checkout, video_view, video_plays, video_p75_watched, bid_amount from public.meta_campaigns where date = current_date limit 5;` — expect the query to succeed (columns exist and are populated or 0, not null-crashing). If the connected account has 0 reachable campaigns (as found in the prior project), this step only proves the request path is error-free — note that explicitly in the report rather than claiming full data verification.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/meta-sync/index.ts
git commit -m "feat: sync initiate-checkout, video engagement, follows, bid amount from Meta Insights"
git push origin HEAD
```

---

### Task 3: `meta-action` — level-aware, type-aware budget editing

**Files:**
- Modify: `supabase/functions/meta-action/index.ts`

**Interfaces:**
- Consumes: `meta_adsets` (needs a token lookup path it didn't have before)
- Produces: `POST /functions/v1/meta-action` body grows from `{action, campaign_id, value?}` to `{action: "budget", level: "campaign"|"adset", id, budget_type: "daily"|"lifetime", value}` for the budget case. `pause`/`resume` keep their existing `{action, campaign_id}` shape unchanged (Consumed by Task 6's `EditBudgetDialog` for budget, and the existing pause/resume buttons for those two actions).

- [ ] **Step 1: Replace the whole file**

```typescript
// supabase/functions/meta-action/index.ts
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://crm.guisalezze.com",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;
    if (!action) {
      return new Response(JSON.stringify({ error: "Missing action" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let graphObjectId: string;
    let token: string;
    let updateData: Record<string, string> = {};

    if (action === "budget") {
      const { level, id, budget_type, value } = body;
      if (!level || !id || !budget_type || value == null) {
        return new Response(JSON.stringify({ error: "Missing level, id, budget_type or value" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (level !== "campaign" && level !== "adset") {
        return new Response(JSON.stringify({ error: "level must be 'campaign' or 'adset'" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (budget_type !== "daily" && budget_type !== "lifetime") {
        return new Response(JSON.stringify({ error: "budget_type must be 'daily' or 'lifetime'" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (level === "campaign") {
        const { data: campaign } = await adminClient
          .from("meta_campaigns")
          .select("campaign_id, meta_ad_accounts!inner(access_token)")
          .eq("campaign_id", id)
          .order("date", { ascending: false })
          .limit(1)
          .single();
        if (!campaign) {
          return new Response(JSON.stringify({ error: "Campaign not found" }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        graphObjectId = id;
        token = (campaign as any).meta_ad_accounts.access_token;
      } else {
        const { data: adset } = await adminClient
          .from("meta_adsets")
          .select("adset_id, meta_campaigns!inner(meta_ad_accounts!inner(access_token))")
          .eq("adset_id", id)
          .order("date", { ascending: false })
          .limit(1)
          .single();
        if (!adset) {
          return new Response(JSON.stringify({ error: "Adset not found" }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        graphObjectId = id;
        token = (adset as any).meta_campaigns.meta_ad_accounts.access_token;
      }

      updateData = budget_type === "daily"
        ? { daily_budget: String(Math.round(Number(value) * 100)) }
        : { lifetime_budget: String(Math.round(Number(value) * 100)) };
    } else {
      const { campaign_id } = body;
      if (!campaign_id) {
        return new Response(JSON.stringify({ error: "Missing campaign_id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: campaign } = await adminClient
        .from("meta_campaigns")
        .select("*, meta_ad_accounts!inner(access_token)")
        .eq("campaign_id", campaign_id)
        .order("date", { ascending: false })
        .limit(1)
        .single();

      if (!campaign) {
        return new Response(JSON.stringify({ error: "Campaign not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      graphObjectId = campaign_id;
      token = (campaign as any).meta_ad_accounts.access_token;

      switch (action) {
        case "pause":
          updateData = { status: "PAUSED" };
          break;
        case "resume":
          updateData = { status: "ACTIVE" };
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    }

    const metaRes = await fetch(
      `https://graph.facebook.com/v21.0/${graphObjectId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...updateData, access_token: token }),
      }
    );

    const metaData = await metaRes.json();
    if (metaData.error) {
      return new Response(JSON.stringify({ error: metaData.error.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

- [ ] **Step 2: Deploy**

Run: `cd lovable-hub-1 && npx supabase functions deploy meta-action` (no `--linked`)
Expected: deploy succeeds.

- [ ] **Step 3: Verify — pause/resume still work (regression check) and budget works for both levels**

```bash
# Regression: existing pause/resume shape unchanged. Get a real campaign_id first:
# npx supabase db query --linked with: select campaign_id from public.meta_campaigns limit 1;
curl -sS -X POST "https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/meta-action" -H "Content-Type: application/json" -d '{"action":"pause","campaign_id":"<real-campaign-id>"}'
# Expected: {"success":true} or a Meta API error message (both prove the request reached Meta correctly) — NOT a 400/500 from this function's own validation.

# New: budget on a campaign
curl -sS -X POST "https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/meta-action" -H "Content-Type: application/json" -d '{"action":"budget","level":"campaign","id":"<real-campaign-id>","budget_type":"daily","value":50}'
# Expected: {"success":true} or a Meta API error (e.g. minimum budget) — not this function's own 400/500.

# New: budget on an adset (get a real adset_id via db query: select adset_id from public.meta_adsets limit 1;)
curl -sS -X POST "https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/meta-action" -H "Content-Type: application/json" -d '{"action":"budget","level":"adset","id":"<real-adset-id>","budget_type":"lifetime","value":500}'
# Expected: same — {"success":true} or a Meta-originated error, not a lookup failure.
```
If there is no reachable campaign/adset to test against (per the prior project's finding that test accounts had 0 reachable campaigns), verify instead that a request with a clearly fake ID returns `404 {"error":"Campaign not found"}` / `404 {"error":"Adset not found"}` — proving the lookup logic itself runs without crashing — and note in the report that full Graph API round-trip verification wasn't possible.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/meta-action/index.ts
git commit -m "feat: make meta-action budget editing level-aware (campaign/adset) and type-aware (daily/lifetime)"
git push origin HEAD
```

---

### Task 4: Shared metric catalog

**Files:**
- Create: `src/lib/metaMetrics.ts`

**Interfaces:**
- Produces: `MetricRow` interface, `MetricDef` interface, `METRIC_CATALOG: MetricDef[]`, `METRIC_GROUPS: Record<string,string>`, `DEFAULT_VISIBLE_METRICS: string[]`, `formatMetricValue(value, format): string`. Consumed by Task 7 (column picker + table renderer).

- [ ] **Step 1: Write the file**

```typescript
// src/lib/metaMetrics.ts

/** Unified shape every level (campaign/adset/ad) normalizes into before rendering. */
export interface MetricRow {
  id: string;            // internal UUID (meta_campaigns.id / meta_adsets.id / meta_ads.id)
  graphId: string;       // Meta's own text ID — what pause/resume/budget actions target
  name: string | null;
  status: string | null;
  date: string;
  adsetName?: string | null;    // only meaningful at adset/ad level
  campaignName?: string | null; // only meaningful at ad level
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;          // sale-linked count, from ad_performance / the rollup views — NOT Meta's own pixel count
  initiate_checkout: number;
  video_view: number;
  video_plays: number;
  video_p75_watched: number;
  follows: number;
  revenue: number | null;
  cpa: number | null;
  roas: number | null;
  profit: number | null;
  bid_amount: number | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
}

export type MetricFormat = "currency" | "number" | "percent" | "multiplier";
export type MetricGroup = "basico" | "funil" | "video" | "social";

export interface MetricDef {
  id: string;
  label: string;
  group: MetricGroup;
  format: MetricFormat;
  compute: (row: MetricRow) => number | null;
}

function div(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

export const METRIC_CATALOG: MetricDef[] = [
  { id: "spend", label: "Gasto", group: "basico", format: "currency", compute: (r) => r.spend },
  { id: "impressions", label: "Impressões", group: "basico", format: "number", compute: (r) => r.impressions },
  { id: "clicks", label: "Cliques", group: "basico", format: "number", compute: (r) => r.clicks },
  { id: "ctr", label: "CTR", group: "basico", format: "percent", compute: (r) => { const v = div(r.clicks, r.impressions); return v == null ? null : v * 100; } },
  { id: "cpm", label: "CPM", group: "basico", format: "currency", compute: (r) => { const v = div(r.spend, r.impressions); return v == null ? null : v * 1000; } },
  { id: "cpc", label: "CPC", group: "basico", format: "currency", compute: (r) => div(r.spend, r.clicks) },
  { id: "conversions", label: "Conv.", group: "basico", format: "number", compute: (r) => r.conversions },
  { id: "cpa", label: "CPA", group: "basico", format: "currency", compute: (r) => r.cpa },
  { id: "revenue", label: "Faturamento", group: "basico", format: "currency", compute: (r) => r.revenue },
  { id: "profit", label: "Lucro", group: "basico", format: "currency", compute: (r) => r.profit },
  { id: "roas", label: "ROAS", group: "basico", format: "multiplier", compute: (r) => r.roas },
  { id: "initiate_checkout", label: "IC (Finalização iniciada)", group: "funil", format: "number", compute: (r) => r.initiate_checkout },
  { id: "cpi", label: "CPI (Custo por IC)", group: "funil", format: "currency", compute: (r) => div(r.spend, r.initiate_checkout) },
  { id: "hook_rate", label: "Hook Rate", group: "video", format: "percent", compute: (r) => { const v = div(r.video_view, r.impressions); return v == null ? null : v * 100; } },
  { id: "play_rate", label: "Play Rate", group: "video", format: "percent", compute: (r) => { const v = div(r.video_plays, r.impressions); return v == null ? null : v * 100; } },
  { id: "hold_rate", label: "Hold Rate", group: "video", format: "percent", compute: (r) => { const v = div(r.video_p75_watched, r.impressions); return v == null ? null : v * 100; } },
  { id: "body_retention", label: "Retenção do Body", group: "video", format: "percent", compute: (r) => { const v = div(r.video_p75_watched, r.video_plays); return v == null ? null : v * 100; } },
  { id: "body_conversion", label: "Conversão do Body", group: "video", format: "percent", compute: (r) => { const v = div(r.conversions, r.video_p75_watched); return v == null ? null : v * 100; } },
  { id: "cost_per_follow", label: "Custo/Seguidor", group: "social", format: "currency", compute: (r) => div(r.spend, r.follows) },
  { id: "bid_amount", label: "Bid Cap", group: "social", format: "currency", compute: (r) => r.bid_amount },
];

export const METRIC_GROUPS: Record<MetricGroup, string> = {
  basico: "Básico",
  funil: "Funil",
  video: "Vídeo",
  social: "Social / Config",
};

export const DEFAULT_VISIBLE_METRICS = ["spend", "clicks", "conversions", "cpa", "roas"];

export function formatMetricValue(value: number | null, format: MetricFormat): string {
  if (value == null || Number.isNaN(value)) return "–";
  switch (format) {
    case "currency":
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
    case "percent":
      return `${value.toFixed(2)}%`;
    case "multiplier":
      return `${value.toFixed(2)}x`;
    default:
      return value.toLocaleString("pt-BR");
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd lovable-hub-1 && npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/metaMetrics.ts
git commit -m "feat: add shared Meta Ads metric catalog (formulas, formatting, grouping)"
git push origin HEAD
```

---

### Task 5: Hooks — per-level metric queries + budget mutation

**Files:**
- Modify: `src/hooks/useMetaAds.ts` (append new exports, end of file)

**Interfaces:**
- Consumes: `meta_campaigns`/`meta_adsets`/`meta_ads` (Task 1's new columns), `campaign_performance`/`adset_performance`/`ad_performance` (Task 1), `MetricRow` (Task 4)
- Produces: `useCampaignMetrics(accountId?, since?, until?): MetricRow[]`, `useAdsetMetrics(accountId?, since?, until?): MetricRow[]`, `useAdMetrics(accountId?, since?, until?): MetricRow[]`, `useUpdateBudget(): UseMutationResult` (variables: `{level: "campaign"|"adset", id: string, budget_type: "daily"|"lifetime", value: number}`)

- [ ] **Step 1: Append the three metric hooks and the budget mutation**

Add at the end of `src/hooks/useMetaAds.ts` (after the existing `useAdPerformance`), and add `import type { MetricRow } from "@/lib/metaMetrics";` to the top of the file alongside the existing imports:

```typescript
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meta-campaign-metrics"] });
      qc.invalidateQueries({ queryKey: ["meta-adset-metrics"] });
    },
  });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd lovable-hub-1 && npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useMetaAds.ts
git commit -m "feat: add per-level metric hooks and level/type-aware budget mutation"
git push origin HEAD
```

---

### Task 6: `EditBudgetDialog` component

**Files:**
- Create: `src/components/nutra/EditBudgetDialog.tsx`

**Interfaces:**
- Consumes: `useUpdateBudget` (Task 5)
- Produces: `<EditBudgetDialog open, onOpenChange, level, id, name, currentDaily, currentLifetime />` — a controlled Dialog, consumed by Task 7.

- [ ] **Step 1: Write the component**

```typescript
// src/components/nutra/EditBudgetDialog.tsx
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2 } from "lucide-react";
import { useUpdateBudget } from "@/hooks/useMetaAds";
import { useToast } from "@/hooks/use-toast";

interface EditBudgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  level: "campaign" | "adset";
  id: string;
  name: string | null;
  currentDaily: number | null;
  currentLifetime: number | null;
}

export function EditBudgetDialog({ open, onOpenChange, level, id, name, currentDaily, currentLifetime }: EditBudgetDialogProps) {
  const [budgetType, setBudgetType] = useState<"daily" | "lifetime">("daily");
  const [value, setValue] = useState("");
  const { toast } = useToast();
  const mutation = useUpdateBudget();

  useEffect(() => {
    if (open) {
      const initial = budgetType === "daily" ? currentDaily : currentLifetime;
      setValue(initial != null ? String(initial) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, budgetType]);

  const handleSave = () => {
    const numValue = Number(value);
    if (!value || Number.isNaN(numValue) || numValue <= 0) {
      toast({ title: "Valor inválido", description: "Informe um valor de orçamento maior que zero.", variant: "destructive" });
      return;
    }
    mutation.mutate(
      { level, id, budget_type: budgetType, value: numValue },
      {
        onSuccess: () => {
          toast({ title: "Orçamento atualizado" });
          onOpenChange(false);
        },
        onError: (e) => toast({ title: "Erro ao atualizar orçamento", description: String(e), variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar orçamento{name ? ` — ${name}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <RadioGroup value={budgetType} onValueChange={(v) => setBudgetType(v as "daily" | "lifetime")} className="flex gap-4">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="daily" id="budget-daily" />
              <Label htmlFor="budget-daily">Diário</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="lifetime" id="budget-lifetime" />
              <Label htmlFor="budget-lifetime">Vitalício</Label>
            </div>
          </RadioGroup>
          <div className="space-y-1.5">
            <Label htmlFor="budget-value">Valor (R$)</Label>
            <Input
              id="budget-value"
              type="number"
              min="0"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0,00"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd lovable-hub-1 && npx tsc --noEmit`
Expected: no new type errors. If `RadioGroup`/`Label`/`Dialog` imports don't resolve, check the exact exported names in `src/components/ui/radio-group.tsx`, `src/components/ui/label.tsx`, `src/components/ui/dialog.tsx` and match them — don't invent props those components don't have.

- [ ] **Step 3: Commit**

```bash
git add src/components/nutra/EditBudgetDialog.tsx
git commit -m "feat: add budget-editing dialog (daily/lifetime)"
git push origin HEAD
```

---

### Task 7: `CampaignMetricsTable` component (level selector + column picker + table)

**Files:**
- Create: `src/components/nutra/CampaignMetricsTable.tsx`

**Interfaces:**
- Consumes: `useCampaignMetrics`/`useAdsetMetrics`/`useAdMetrics` (Task 5), `METRIC_CATALOG`/`METRIC_GROUPS`/`DEFAULT_VISIBLE_METRICS`/`formatMetricValue`/`MetricRow` (Task 4), `EditBudgetDialog` (Task 6), `useMetaAction` (existing, for pause/resume)
- Produces: `<CampaignMetricsTable accountId, since, until />` — a self-contained component owning its own level state, column-visibility state (persisted to `localStorage`), and budget-dialog state. Consumed by Task 8.

- [ ] **Step 1: Write the component**

```typescript
// src/components/nutra/CampaignMetricsTable.tsx
import { useState, useMemo } from "react";
import { Settings2, DollarSign, Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCampaignMetrics, useAdsetMetrics, useAdMetrics, useMetaAction } from "@/hooks/useMetaAds";
import { METRIC_CATALOG, METRIC_GROUPS, DEFAULT_VISIBLE_METRICS, formatMetricValue, type MetricGroup, type MetricRow } from "@/lib/metaMetrics";
import { EditBudgetDialog } from "./EditBudgetDialog";
import { useToast } from "@/hooks/use-toast";

type Level = "campaign" | "adset" | "ad";

const STORAGE_KEY = "meta-ads-visible-metrics";

function loadVisibleMetrics(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE_METRICS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_VISIBLE_METRICS;
  } catch {
    return DEFAULT_VISIBLE_METRICS;
  }
}

interface CampaignMetricsTableProps {
  accountId?: string;
  since: string;
  until: string;
}

export function CampaignMetricsTable({ accountId, since, until }: CampaignMetricsTableProps) {
  const [level, setLevel] = useState<Level>("campaign");
  const [visibleMetrics, setVisibleMetrics] = useState<string[]>(loadVisibleMetrics);
  const [budgetTarget, setBudgetTarget] = useState<{ level: "campaign" | "adset"; row: MetricRow } | null>(null);
  const { toast } = useToast();
  const actionMutation = useMetaAction();

  const campaignQuery = useCampaignMetrics(level === "campaign" ? accountId : undefined, since, until);
  const adsetQuery = useAdsetMetrics(level === "adset" ? accountId : undefined, since, until);
  const adQuery = useAdMetrics(level === "ad" ? accountId : undefined, since, until);

  const { data: rows, isLoading } =
    level === "campaign" ? campaignQuery : level === "adset" ? adsetQuery : adQuery;

  const activeMetrics = useMemo(
    () => METRIC_CATALOG.filter((m) => visibleMetrics.includes(m.id)),
    [visibleMetrics]
  );

  const toggleMetric = (id: string) => {
    setVisibleMetrics((prev) => {
      const next = prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleToggleStatus = (row: MetricRow) => {
    actionMutation.mutate(
      { action: row.status === "ACTIVE" ? "pause" : "resume", campaign_id: row.graphId },
      {
        onSuccess: () => toast({ title: "Status atualizado" }),
        onError: (e) => toast({ title: "Erro", description: String(e), variant: "destructive" }),
      }
    );
  };

  const groups = Object.keys(METRIC_GROUPS) as MetricGroup[];
  const nameColumnLabel = level === "campaign" ? "Campanha" : level === "adset" ? "Conjunto" : "Anúncio";
  const showActions = level !== "ad";
  const colCount = 2 + activeMetrics.length + (showActions ? 1 : 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <ToggleGroup type="single" value={level} onValueChange={(v) => v && setLevel(v as Level)} className="justify-start">
          <ToggleGroupItem value="campaign" className="text-xs">Campanha</ToggleGroupItem>
          <ToggleGroupItem value="adset" className="text-xs">Conjunto</ToggleGroupItem>
          <ToggleGroupItem value="ad" className="text-xs">Anúncio</ToggleGroupItem>
        </ToggleGroup>

        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline">
              <Settings2 className="h-3.5 w-3.5 mr-1" />
              Colunas
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 max-h-96 overflow-y-auto" align="end">
            <div className="space-y-4">
              {groups.map((group) => (
                <div key={group} className="space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {METRIC_GROUPS[group]}
                  </p>
                  {METRIC_CATALOG.filter((m) => m.group === group).map((m) => (
                    <div key={m.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`metric-${m.id}`}
                        checked={visibleMetrics.includes(m.id)}
                        onCheckedChange={() => toggleMetric(m.id)}
                      />
                      <Label htmlFor={`metric-${m.id}`} className="text-sm font-normal cursor-pointer">
                        {m.label}
                      </Label>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="glass-card overflow-hidden overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{nameColumnLabel}</TableHead>
              <TableHead>Status</TableHead>
              {activeMetrics.map((m) => (
                <TableHead key={m.id} className="text-right whitespace-nowrap">{m.label}</TableHead>
              ))}
              {showActions && <TableHead className="text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: colCount }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : !rows || rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount} className="text-center text-sm text-muted-foreground py-8">
                  Nenhum dado encontrado no período
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={`${row.id}-${row.date}`}>
                  <TableCell className="font-medium text-sm max-w-[200px] truncate">{row.name || row.graphId}</TableCell>
                  <TableCell>
                    <Badge variant={row.status === "ACTIVE" ? "default" : "secondary"} className="text-[10px]">
                      {row.status}
                    </Badge>
                  </TableCell>
                  {activeMetrics.map((m) => (
                    <TableCell key={m.id} className="text-right text-sm whitespace-nowrap">
                      {formatMetricValue(m.compute(row), m.format)}
                    </TableCell>
                  ))}
                  {showActions && (
                    <TableCell className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleToggleStatus(row)}>
                          {row.status === "ACTIVE" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => setBudgetTarget({ level: level as "campaign" | "adset", row })}
                        >
                          <DollarSign className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {budgetTarget && (
        <EditBudgetDialog
          open={!!budgetTarget}
          onOpenChange={(open) => { if (!open) setBudgetTarget(null); }}
          level={budgetTarget.level}
          id={budgetTarget.row.graphId}
          name={budgetTarget.row.name}
          currentDaily={budgetTarget.row.daily_budget}
          currentLifetime={budgetTarget.row.lifetime_budget}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd lovable-hub-1 && npx tsc --noEmit`
Expected: no new type errors. If `ToggleGroup`/`ToggleGroupItem`/`Checkbox`/`Popover` imports don't resolve with these exact names, check `src/components/ui/toggle-group.tsx`, `src/components/ui/checkbox.tsx`, `src/components/ui/popover.tsx` for the actual exported names and match them.

- [ ] **Step 3: Commit**

```bash
git add src/components/nutra/CampaignMetricsTable.tsx
git commit -m "feat: add level selector + customizable column picker + budget action to campaign table"
git push origin HEAD
```

---

### Task 8: Wire `CampaignMetricsTable` into `MetaAds.tsx`

**Files:**
- Modify: `src/pages/nutra/MetaAds.tsx`

**Interfaces:**
- Consumes: `CampaignMetricsTable` (Task 7)
- Produces: the "Campanhas" tab's body is replaced; the "Atribuição" tab and everything above the tabs (header, date pickers, Sync/Regras buttons, KPI cards) is untouched.

- [ ] **Step 1: Add the import**

Add to the top of `src/pages/nutra/MetaAds.tsx`, alongside the existing imports:
```typescript
import { CampaignMetricsTable } from "@/components/nutra/CampaignMetricsTable";
```

- [ ] **Step 2: Replace the "Campanhas" `TabsContent` body**

Replace this entire block (currently lines 143-210 of the file — the `<TabsContent value="campanhas">` through its matching `</TabsContent>`, containing the inline `<Table>` with Campanha/Status/Gasto/Cliques/Conv./CPA/ROAS/Ações columns):
```typescript
          <TabsContent value="campanhas">
            <div className="glass-card overflow-hidden">
              <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campanha</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Gasto</TableHead>
                <TableHead className="text-right">Cliques</TableHead>
                <TableHead className="text-right">Conv.</TableHead>
                <TableHead className="text-right">CPA</TableHead>
                <TableHead className="text-right">ROAS</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaignsLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : campaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                    Nenhuma campanha encontrada no período
                  </TableCell>
                </TableRow>
              ) : (
                campaigns.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium text-sm max-w-[200px] truncate">{c.campaign_name}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === "ACTIVE" ? "default" : "secondary"} className="text-[10px]">
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm">{fmtBRL(Number(c.spend || 0))}</TableCell>
                    <TableCell className="text-right text-sm">{Number(c.clicks || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right text-sm">{Number(c.conversions || 0)}</TableCell>
                    <TableCell className="text-right text-sm">
                      {Number(c.conversions || 0) > 0 ? fmtBRL(Number(c.spend || 0) / Number(c.conversions)) : "–"}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {Number(c.spend || 0) > 0 ? `${(Number(c.revenue || 0) / Number(c.spend)).toFixed(2)}x` : "–"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        {c.status === "ACTIVE" ? (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleAction(c.campaign_id, "pause")}>
                            <Pause className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleAction(c.campaign_id, "resume")}>
                            <Play className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
              </Table>
            </div>
          </TabsContent>
```
with:
```typescript
          <TabsContent value="campanhas">
            <CampaignMetricsTable accountId={activeAccount?.id} since={since} until={until} />
          </TabsContent>
```

- [ ] **Step 3: Remove now-unused state/handlers**

`campaigns`, `campaignsLoading`, `handleAction` (the one taking `(campaignId, action)` and calling `actionMutation.mutate({action, campaign_id: campaignId})`) are no longer used by the "Campanhas" tab (that logic now lives inside `CampaignMetricsTable`). Check whether `campaigns`/`totalSpend`/`totalClicks`/`totalConversions`/`totalRevenue`/`avgRoas` (the KPI-card block above the tabs) still need `useMetaAdCampaigns` — **they do**, the KPI cards at the top of the page are untouched by this task and still read from `campaigns`. Only remove `handleAction` and the `Pause`/`Play` icon imports if nothing else in the file uses them after this edit (double check — `CampaignMetricsTable` has its own internal pause/resume via its own `useMetaAction()` call, it does not receive `handleAction` as a prop). Keep `useMetaAdCampaigns`, `campaigns`, `campaignsLoading` — the KPI cards need them. Keep `Badge`, `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow`, `Skeleton` imports if the "Atribuição" tab (untouched by this task) still uses them — it does.

- [ ] **Step 4: Verify**

Run: `cd lovable-hub-1 && npx tsc --noEmit && npm run build`
Expected: both succeed with no new errors. Then `npm run dev`, open `/meta-ads`, confirm: the "Campanhas" tab shows the level toggle + Colunas popover + table; switching levels swaps the table; toggling a checkbox in "Colunas" adds/removes that column and survives a page reload (localStorage); the "Atribuição" tab is unaffected; the KPI cards above the tabs still render.

- [ ] **Step 5: Commit**

```bash
git add src/pages/nutra/MetaAds.tsx
git commit -m "feat: wire CampaignMetricsTable into the Campanhas tab (level selector + column picker + budget editing)"
git push origin HEAD
```

## Self-Review Notes

- **Spec coverage:** Goal 1 (level selector) → Task 7/8. Goal 2 (column picker, localStorage) → Task 7. Goal 3 (new metrics) → Tasks 1, 2, 4. Goal 4 (budget modal, daily/lifetime) → Tasks 3, 6, 7. Goal 5 (`meta-sync` extension) → Task 2. Non-goals (ICR/CON, DB-backed prefs, non-budget editing, drill-down nav) are not touched by any task.
- **Placeholder scan:** none found — every task has complete code, no "add validation here"-style stubs.
- **Type consistency checked:** `MetricRow` (Task 4) field names match exactly what Task 5's three hooks populate and what Task 7's `METRIC_CATALOG.compute` functions read (`video_p75_watched`, `initiate_checkout`, `follows`, etc. — same spelling throughout, matching the DB column names from Task 1 one-for-one). `useUpdateBudget`'s mutation variable shape (Task 5) matches exactly what `EditBudgetDialog` (Task 6) passes and what `meta-action` (Task 3) expects (`level`, `id`, `budget_type`, `value`).
