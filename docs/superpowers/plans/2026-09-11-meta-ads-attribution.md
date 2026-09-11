# Meta Ads Sale Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect Meta ad spend (down to the individual ad/creative) to the exact sale it produced, for both the Educacional (PerfectPay) and Nutra (CartPanda) funnels, with a server-side Conversions API purchase event and a new CRM page to see it.

**Architecture:** A landing-page script (`tracking.js`) captures UTMs/click-IDs and a `rt_vid` cookie, POSTs visits to a new public `ad-collect` edge function, and stamps outbound checkout links. The two sale webhooks (`perfectpay-webhook`, `cartpanda-s2s`) parse the `name|id` convention out of incoming UTMs (falling back to an `ad_visits` lookup by `rt_vid`), write the resolved `campaign_id`/`adset_id`/`ad_id` onto the sale row, and fire a `meta-capi` Purchase event. `meta-sync` gains ad-level insight sync (cron'd) so a new `ad_performance` view can compute real CPA/ROAS/profit per ad.

**Tech Stack:** Supabase Postgres (migrations, `pg_cron`, `pg_net`), Deno edge functions (existing convention: no shared `_shared/` folder, each function self-contained), vanilla JS static asset for the LP script, React + TanStack Query + shadcn/ui for the new tab (matching `useMetaAds.ts` / `MetaAds.tsx` conventions).

**Spec:** `docs/superpowers/specs/2026-09-11-meta-ads-attribution-design.md`

## Global Constraints

- No test framework exists in this repo (no vitest/jest) — every task's "test" step is a concrete manual verification command (`npx supabase db query --linked`, `curl`, or a browser check), not a unit test file.
- Follow existing edge function conventions: no shared code module, each `index.ts` is self-contained (`corsHeaders` duplicated per function, as in `send-push-notification`, `cartpanda-s2s`, etc.).
- All new/changed Supabase objects go through `supabase/migrations/*.sql`, applied via `npx supabase db push --linked --yes` from `lovable-hub-1/` (the project is already linked to `lqrlvefeznfaauwgvubl`).
- New edge functions need a `[functions.<name>]` entry with `verify_jwt = false` in `supabase/config.toml` if they're called by an unauthenticated client (the LP) or by `net.http_post` from a DB trigger/cron (matches `perfectpay-webhook`, `cartpanda-s2s`, `send-push-notification`, `task-reminders-cron` today).
- Money/ROAS math follows the existing convention in this codebase: `sale_amount`/`amount` on approved rows only, no tax/fee deduction (matches `client_ltv`, `Relatorios.tsx`).
- Non-goals (do not build): CAPI retry queue, rules engine, Google/TikTok sync, ClickBank attribution, changes to the existing whole-business ROAS in `Relatorios.tsx`.

---

### Task 1: Database schema — `ad_visits`, attribution columns, fixed upsert keys, `ad_performance` view

**Files:**
- Create: `supabase/migrations/20260911000003_ad_attribution_schema.sql`

**Interfaces:**
- Produces: table `public.ad_visits` (columns: `id uuid`, `rt_vid uuid`, `project text`, `utm_source/medium/campaign/content/term text`, `fbclid/fbp/fbc text`, `campaign_id/adset_id/ad_id text`, `campaign_name/adset_name/ad_name text`, `landing_url text`, `referrer text`, `ip text`, `user_agent text`, `created_at timestamptz`)
- Produces: `public.sales` gains `utm_source/medium/campaign/content text`, `fbclid/fbp/fbc text`, `campaign_id/adset_id/ad_id text`
- Produces: `public.nutra_sales` gains `fbclid/fbp/fbc text`, `campaign_id/adset_id/ad_id text`
- Produces: unique constraints `meta_campaigns_account_campaign_date_key (ad_account_id, campaign_id, date)`, `meta_adsets_campaign_adset_date_key (campaign_id, adset_id, date)`, `meta_ads_adset_ad_date_key (adset_id, ad_id, date)`
- Produces: view `public.ad_performance` (columns: `ad_id, ad_name, adset_name, campaign_name, ad_account_id, date, spend, impressions, clicks, sales_count, revenue, cpa, roas, profit`)
- Consumes: nothing (first task)

- [ ] **Step 1: Write the migration**

```sql
-- ad_visits: one row per landing-page visit observed by tracking.js
CREATE TABLE public.ad_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rt_vid uuid NOT NULL,
  project text NOT NULL CHECK (project IN ('educacional', 'nutra')),
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  fbclid text,
  fbp text,
  fbc text,
  campaign_id text,
  adset_id text,
  ad_id text,
  campaign_name text,
  adset_name text,
  ad_name text,
  landing_url text,
  referrer text,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ad_visits_rt_vid_idx ON public.ad_visits (rt_vid);
CREATE INDEX ad_visits_created_at_idx ON public.ad_visits (created_at);

ALTER TABLE public.ad_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team can read ad_visits" ON public.ad_visits FOR SELECT TO authenticated USING (true);
-- No insert/update/delete policy: only the service-role ad-collect function writes here.

-- Daily cleanup — keep 90 days of raw visit data
SELECT cron.schedule(
  'ad-visits-cleanup-daily',
  '0 3 * * *',
  $$ DELETE FROM public.ad_visits WHERE created_at < now() - interval '90 days'; $$
);

-- sales (Educacional/PerfectPay) — no UTM columns existed before this
ALTER TABLE public.sales
  ADD COLUMN utm_source text,
  ADD COLUMN utm_medium text,
  ADD COLUMN utm_campaign text,
  ADD COLUMN utm_content text,
  ADD COLUMN fbclid text,
  ADD COLUMN fbp text,
  ADD COLUMN fbc text,
  ADD COLUMN campaign_id text,
  ADD COLUMN adset_id text,
  ADD COLUMN ad_id text;

-- nutra_sales already has utm_source/medium/campaign as text
ALTER TABLE public.nutra_sales
  ADD COLUMN fbclid text,
  ADD COLUMN fbp text,
  ADD COLUMN fbc text,
  ADD COLUMN campaign_id text,
  ADD COLUMN adset_id text,
  ADD COLUMN ad_id text;

-- Fix meta_campaigns/meta_adsets/meta_ads: today's upsert calls use onConflict:"id" against a
-- freshly-generated uuid, which never collides — every sync run inserts fresh duplicate rows
-- instead of updating. Add real dedup keys so ad-level sync (Task 4, cron'd every 15-30min)
-- doesn't explode row count.
ALTER TABLE public.meta_campaigns
  ADD CONSTRAINT meta_campaigns_account_campaign_date_key UNIQUE (ad_account_id, campaign_id, date);
ALTER TABLE public.meta_adsets
  ADD CONSTRAINT meta_adsets_campaign_adset_date_key UNIQUE (campaign_id, adset_id, date);
ALTER TABLE public.meta_ads
  ADD CONSTRAINT meta_ads_adset_ad_date_key UNIQUE (adset_id, ad_id, date);

-- Per-ad performance: spend/impressions/clicks (from meta_ads) joined against attributed sales
-- (from sales + nutra_sales) by ad_id + day. Computed on read, no denormalized revenue column.
CREATE OR REPLACE VIEW public.ad_performance AS
WITH spend AS (
  SELECT
    ma.ad_id, ma.ad_name, ma.date, ma.spend, ma.impressions, ma.clicks,
    mas.adset_name, mc.campaign_name, mc.ad_account_id
  FROM public.meta_ads ma
  JOIN public.meta_adsets mas ON mas.id = ma.adset_id
  JOIN public.meta_campaigns mc ON mc.id = mas.campaign_id
),
edu_sales AS (
  SELECT ad_id, date(date_approved) AS date, count(*) AS sales_count, sum(sale_amount) AS revenue
  FROM public.sales
  WHERE sale_status_enum = 'approved' AND ad_id IS NOT NULL AND date_approved IS NOT NULL
  GROUP BY ad_id, date(date_approved)
),
nutra_agg AS (
  SELECT ad_id, date(created_at) AS date, count(*) AS sales_count, sum(amount) AS revenue
  FROM public.nutra_sales
  WHERE status = 'approved' AND ad_id IS NOT NULL
  GROUP BY ad_id, date(created_at)
),
sales_agg AS (
  SELECT ad_id, date, sum(sales_count) AS sales_count, sum(revenue) AS revenue
  FROM (SELECT * FROM edu_sales UNION ALL SELECT * FROM nutra_agg) u
  GROUP BY ad_id, date
)
SELECT
  s.ad_id, s.ad_name, s.adset_name, s.campaign_name, s.ad_account_id, s.date,
  s.spend, s.impressions, s.clicks,
  COALESCE(sa.sales_count, 0) AS sales_count,
  COALESCE(sa.revenue, 0) AS revenue,
  CASE WHEN COALESCE(sa.sales_count, 0) > 0 THEN s.spend / sa.sales_count ELSE NULL END AS cpa,
  CASE WHEN s.spend > 0 THEN COALESCE(sa.revenue, 0) / s.spend ELSE NULL END AS roas,
  COALESCE(sa.revenue, 0) - s.spend AS profit
FROM spend s
LEFT JOIN sales_agg sa ON sa.ad_id = s.ad_id AND sa.date = s.date;

GRANT SELECT ON public.ad_performance TO authenticated;
```

- [ ] **Step 2: Apply the migration**

Run: `cd lovable-hub-1 && npx supabase db push --linked --yes`
Expected: `"Finished supabase db push."` with the new migration filename listed.

- [ ] **Step 3: Verify the schema landed correctly**

Run (save as a temp `.sql` file and use `npx supabase db query --linked --file`, matching this session's pattern):
```sql
select column_name from information_schema.columns where table_name = 'ad_visits' order by ordinal_position;
select column_name from information_schema.columns where table_name = 'sales' and column_name in ('fbclid','ad_id','utm_campaign');
select conname from pg_constraint where conname in ('meta_campaigns_account_campaign_date_key','meta_adsets_campaign_adset_date_key','meta_ads_adset_ad_date_key');
select 1 from pg_views where viewname = 'ad_performance';
```
Expected: `ad_visits` lists all 19 columns; `sales` shows the 3 named columns; all 3 constraint names returned; `ad_performance` returns one row (the literal `1`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260911000003_ad_attribution_schema.sql
git commit -m "feat(db): add ad_visits, sale attribution columns, and ad_performance view"
git push origin HEAD
```

---

### Task 2: `ad-collect` edge function

**Files:**
- Create: `supabase/functions/ad-collect/index.ts`
- Modify: `supabase/config.toml` (add `[functions.ad-collect]` with `verify_jwt = false`)

**Interfaces:**
- Consumes: table `public.ad_visits` (Task 1)
- Produces: `POST https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/ad-collect` accepting JSON body `{ rt_vid: string, project: 'educacional'|'nutra', utm_source?, utm_medium?, utm_campaign?, utm_content?, utm_term?, fbclid?, fbp?, fbc?, landing_url?, referrer? }`, all optional except `rt_vid` and `project`. Consumed by `tracking.js` (Task 3).

- [ ] **Step 1: Write the function**

```typescript
// supabase/functions/ad-collect/index.ts
const EDUCACIONAL_ORIGIN_RE = /^https:\/\/([a-z0-9-]+\.)*guisalezze\.com$/i;

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (EDUCACIONAL_ORIGIN_RE.test(origin)) return true;
  const nutraAllowlist = (Deno.env.get("NUTRA_LP_ORIGINS") || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  return nutraAllowlist.includes(origin);
}

function corsHeadersFor(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin! : "https://crm.guisalezze.com",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// "Campanha Frio 01|120210987654320123" -> { name: "Campanha Frio 01", id: "120210987654320123" }
const ID_RE = /^\d{6,}$/;
function splitNameId(value?: string | null): { name: string | null; id: string | null } {
  if (!value) return { name: null, id: null };
  const raw = decodeURIComponent(String(value).replace(/\+/g, " ")).trim();
  if (!raw) return { name: null, id: null };
  const cut = raw.lastIndexOf("|");
  if (cut === -1) return ID_RE.test(raw) ? { name: null, id: raw } : { name: raw, id: null };
  const name = raw.slice(0, cut).trim() || null;
  const tail = raw.slice(cut + 1).trim();
  return { name, id: ID_RE.test(tail) ? tail : null };
}

interface CollectPayload {
  rt_vid: string;
  project: "educacional" | "nutra";
  utm_source?: string; utm_medium?: string; utm_campaign?: string;
  utm_content?: string; utm_term?: string;
  fbclid?: string; fbp?: string; fbc?: string;
  landing_url?: string; referrer?: string;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = corsHeadersFor(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!isAllowedOrigin(origin)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: CollectPayload;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.rt_vid || !body.project || !["educacional", "nutra"].includes(body.project)) {
    return new Response(JSON.stringify({ error: "rt_vid and project are required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const campaign = splitNameId(body.utm_campaign);
  const adset = splitNameId(body.utm_medium);
  const ad = splitNameId(body.utm_content);

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { error } = await adminClient.from("ad_visits").insert({
    rt_vid: body.rt_vid,
    project: body.project,
    utm_source: body.utm_source ?? null,
    utm_medium: body.utm_medium ?? null,
    utm_campaign: body.utm_campaign ?? null,
    utm_content: body.utm_content ?? null,
    utm_term: body.utm_term ?? null,
    fbclid: body.fbclid ?? null,
    fbp: body.fbp ?? null,
    fbc: body.fbc ?? null,
    campaign_id: campaign.id,
    adset_id: adset.id,
    ad_id: ad.id,
    campaign_name: campaign.name,
    adset_name: adset.name,
    ad_name: ad.name,
    landing_url: body.landing_url ?? null,
    referrer: body.referrer ?? null,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    user_agent: req.headers.get("user-agent") ?? null,
  });

  if (error) {
    console.error("ad-collect insert error:", error);
    return new Response(JSON.stringify({ error: "Failed to record visit" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 2: Register the function as public in `supabase/config.toml`**

Add (matching the existing block style, e.g. right after `[functions.cartpanda-s2s]`):
```toml
[functions.ad-collect]
verify_jwt = false
```

- [ ] **Step 3: Deploy**

Run: `cd lovable-hub-1 && npx supabase functions deploy ad-collect --linked`
Expected: deploy succeeds with no errors.

- [ ] **Step 4: Verify with a real request**

Run (replace `<anon-key>` with the value from `.env`'s `VITE_SUPABASE_PUBLISHABLE_KEY`, used only because it doubles as a valid `Origin`-less test — for a true CORS check, set the `Origin` header):
```bash
curl -sS -i -X POST "https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/ad-collect" \
  -H "Origin: https://lp.guisalezze.com" \
  -H "Content-Type: application/json" \
  -d '{"rt_vid":"11111111-1111-1111-1111-111111111111","project":"educacional","utm_campaign":"Teste|120210000000001","utm_medium":"ConjuntoTeste|120210000000002","utm_content":"AnuncioTeste|120210000000003"}'
```
Expected: `HTTP/2 200`, body `{"ok":true}`. Then confirm the row via `npx supabase db query --linked` with `select * from public.ad_visits where rt_vid = '11111111-1111-1111-1111-111111111111';` — expect `campaign_id = '120210000000001'`, `adset_id = '120210000000002'`, `ad_id = '120210000000003'`, `campaign_name = 'Teste'`. Also verify a request with `Origin: https://evil.example.com` gets `403`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/ad-collect/index.ts supabase/config.toml
git commit -m "feat: add ad-collect public endpoint for landing-page visit tracking"
git push origin HEAD
```

---

### Task 3: `tracking.js` landing-page script

**Files:**
- Create: `public/tracking.js`

**Interfaces:**
- Consumes: `POST /functions/v1/ad-collect` (Task 2)
- Produces: a static file served at `https://crm.guisalezze.com/tracking.js` (Vite's `public/` folder is copied verbatim to `dist/` on build) for external LPs to `<script src="https://crm.guisalezze.com/tracking.js" data-project="educacional" data-checkout-hosts="perfectpay.com.br,pay.perfectpay.com.br"></script>` in their `<head>`.

- [ ] **Step 1: Write the script**

```javascript
// public/tracking.js
// Pasted on external landing pages: <script src=".../tracking.js" data-project="educacional"></script>
(function () {
  var SCRIPT = document.currentScript;
  var PROJECT = (SCRIPT && SCRIPT.dataset.project) || "educacional";
  var CHECKOUT_HOSTS = ((SCRIPT && SCRIPT.dataset.checkoutHosts) ||
    "perfectpay.com.br,pay.perfectpay.com.br,cartpanda.com,checkout.cartpanda.com"
  ).split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  var COLLECT_URL = (SCRIPT && SCRIPT.dataset.collectUrl) ||
    "https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/ad-collect";

  function getCookie(name) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function setCookie(name, value, days) {
    var d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = name + "=" + encodeURIComponent(value) +
      "; expires=" + d.toUTCString() + "; path=/; SameSite=Lax";
  }
  function uuidv4() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0, v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  var rtVid = getCookie("rt_vid");
  if (!rtVid) {
    rtVid = uuidv4();
    setCookie("rt_vid", rtVid, 30);
  }

  var params = new URLSearchParams(window.location.search);
  var utms = {
    utm_source: params.get("utm_source"),
    utm_medium: params.get("utm_medium"),
    utm_campaign: params.get("utm_campaign"),
    utm_content: params.get("utm_content"),
    utm_term: params.get("utm_term"),
    fbclid: params.get("fbclid"),
  };
  // Persist across the session in case the visitor navigates before checking out
  Object.keys(utms).forEach(function (k) {
    if (utms[k]) setCookie("rt_" + k, utms[k], 30);
    else utms[k] = getCookie("rt_" + k) || undefined;
  });

  var payload = {
    rt_vid: rtVid,
    project: PROJECT,
    utm_source: utms.utm_source || undefined,
    utm_medium: utms.utm_medium || undefined,
    utm_campaign: utms.utm_campaign || undefined,
    utm_content: utms.utm_content || undefined,
    utm_term: utms.utm_term || undefined,
    fbclid: utms.fbclid || undefined,
    fbp: getCookie("_fbp") || undefined,
    fbc: getCookie("_fbc") || undefined,
    landing_url: window.location.href,
    referrer: document.referrer || undefined,
  };

  try {
    var body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      var blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(COLLECT_URL, blob);
    } else {
      fetch(COLLECT_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: body, keepalive: true });
    }
  } catch (e) { /* never break the LP */ }

  function isCheckoutLink(href) {
    try {
      var host = new URL(href, window.location.href).hostname;
      return CHECKOUT_HOSTS.some(function (h) { return host === h || host.endsWith("." + h); });
    } catch (e) { return false; }
  }

  function stampLink(a) {
    if (!a.href || a.dataset.rtStamped) return;
    if (!isCheckoutLink(a.href)) return;
    try {
      var url = new URL(a.href, window.location.href);
      url.searchParams.set("rt_vid", rtVid);
      Object.keys(utms).forEach(function (k) {
        if (utms[k]) url.searchParams.set(k, utms[k]);
      });
      a.href = url.toString();
      a.dataset.rtStamped = "1";
    } catch (e) { /* ignore malformed hrefs */ }
  }

  function stampAll() {
    document.querySelectorAll("a[href]").forEach(stampLink);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", stampAll);
  } else {
    stampAll();
  }

  // Catch links inserted after initial render (page builders often do this)
  new MutationObserver(function () { stampAll(); }).observe(document.documentElement, {
    childList: true, subtree: true,
  });
})();
```

- [ ] **Step 2: Verify it builds and is served**

Run: `cd lovable-hub-1 && npm run build`
Expected: build succeeds; `dist/tracking.js` exists (`ls dist/tracking.js`) with the same content as `public/tracking.js`.

- [ ] **Step 3: Manual browser verification (after deploy)**

Open a test HTML page with:
```html
<a href="https://pay.perfectpay.com.br/checkout/abc">Comprar</a>
<script src="https://crm.guisalezze.com/tracking.js" data-project="educacional"></script>
```
at `https://lp.guisalezze.com/?utm_campaign=Teste|120210000000001&utm_medium=Conjunto|120210000000002&utm_content=Anuncio|120210000000003`. Expected: DevTools Network tab shows a `POST` to `ad-collect` returning `200`; the `<a>` tag's `href` (inspect element after page load) now includes `rt_vid`, `utm_campaign`, etc. as query params.

- [ ] **Step 4: Commit**

```bash
git add public/tracking.js
git commit -m "feat: add landing-page tracking script (tracking.js)"
git push origin HEAD
```

---

### Task 4: `meta-sync` — ad-level insights + sync-all-accounts mode

**Files:**
- Modify: `supabase/functions/meta-sync/index.ts` (full rewrite of the campaign loop body, same file)
- Modify: `supabase/config.toml` (add `[functions.meta-sync]` with `verify_jwt = false`, needed for the Task 8 cron call)

**Interfaces:**
- Consumes: tables `meta_ad_accounts`, `meta_campaigns`, `meta_adsets`, `meta_ads` (Task 1's unique constraints)
- Produces: `POST /functions/v1/meta-sync` with body `{ ad_account_id: string }` (unchanged, used by the manual "Sync" button) **or** `{}` / no body (new — syncs every `is_active = true` account, used by the Task 8 cron)

- [ ] **Step 1: Replace the function body**

```typescript
// supabase/functions/meta-sync/index.ts
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://crm.guisalezze.com",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function syncAccount(adminClient: any, account: any) {
  const token = account.access_token;
  const actId = `act_${account.account_id}`;
  const today = new Date().toISOString().split("T")[0];
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const campaignsRes = await fetch(
    `https://graph.facebook.com/v21.0/${actId}/campaigns?fields=name,status,objective,daily_budget,lifetime_budget&limit=100&access_token=${token}`
  );
  const campaignsData = await campaignsRes.json();
  if (campaignsData.error) {
    console.error(`meta-sync: account ${account.id} campaigns error`, campaignsData.error);
    return { account_id: account.id, error: campaignsData.error.message };
  }

  let syncedCampaigns = 0, syncedAdsets = 0, syncedAds = 0;

  for (const campaign of (campaignsData.data || [])) {
    const insightsRes = await fetch(
      `https://graph.facebook.com/v21.0/${campaign.id}/insights?fields=spend,impressions,clicks,actions&time_range={"since":"${since}","until":"${today}"}&time_increment=1&access_token=${token}`
    );
    const insightsData = await insightsRes.json();

    for (const day of (insightsData.data || [])) {
      const conversions = (day.actions || [])
        .filter((a: any) => a.action_type === "offsite_conversion.fb_pixel_purchase" || a.action_type === "purchase")
        .reduce((s: number, a: any) => s + Number(a.value || 0), 0);

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
          spend: Number(day.spend || 0),
          impressions: Number(day.impressions || 0),
          clicks: Number(day.clicks || 0),
          conversions: conversions,
          date: day.date_start,
        }, { onConflict: "ad_account_id,campaign_id,date" })
        .select("id")
        .single();

      if (campaignErr || !campaignRow) {
        console.error("meta-sync: campaign upsert failed", campaignErr);
        continue;
      }
      syncedCampaigns++;

      // Ad sets for this campaign, same date
      const adsetsRes = await fetch(
        `https://graph.facebook.com/v21.0/${campaign.id}/adsets?fields=name,status,daily_budget&limit=100&access_token=${token}`
      );
      const adsetsData = await adsetsRes.json();
      if (adsetsData.error) continue;

      for (const adset of (adsetsData.data || [])) {
        const adsetInsightsRes = await fetch(
          `https://graph.facebook.com/v21.0/${adset.id}/insights?fields=spend,impressions,clicks,actions&time_range={"since":"${day.date_start}","until":"${day.date_start}"}&access_token=${token}`
        );
        const adsetInsightsData = await adsetInsightsRes.json();
        const adsetDay = (adsetInsightsData.data || [])[0];
        if (!adsetDay) continue;

        const adsetConversions = (adsetDay.actions || [])
          .filter((a: any) => a.action_type === "offsite_conversion.fb_pixel_purchase" || a.action_type === "purchase")
          .reduce((s: number, a: any) => s + Number(a.value || 0), 0);

        const { data: adsetRow, error: adsetErr } = await adminClient
          .from("meta_adsets")
          .upsert({
            campaign_id: campaignRow.id,
            adset_id: adset.id,
            adset_name: adset.name,
            status: adset.status,
            daily_budget: adset.daily_budget ? Number(adset.daily_budget) / 100 : null,
            spend: Number(adsetDay.spend || 0),
            impressions: Number(adsetDay.impressions || 0),
            clicks: Number(adsetDay.clicks || 0),
            conversions: adsetConversions,
            date: day.date_start,
          }, { onConflict: "campaign_id,adset_id,date" })
          .select("id")
          .single();

        if (adsetErr || !adsetRow) {
          console.error("meta-sync: adset upsert failed", adsetErr);
          continue;
        }
        syncedAdsets++;

        // Ads for this adset, same date
        const adsRes = await fetch(
          `https://graph.facebook.com/v21.0/${adset.id}/ads?fields=name,status,creative{thumbnail_url}&limit=100&access_token=${token}`
        );
        const adsData = await adsRes.json();
        if (adsData.error) continue;

        for (const ad of (adsData.data || [])) {
          const adInsightsRes = await fetch(
            `https://graph.facebook.com/v21.0/${ad.id}/insights?fields=spend,impressions,clicks,actions&time_range={"since":"${day.date_start}","until":"${day.date_start}"}&access_token=${token}`
          );
          const adInsightsData = await adInsightsRes.json();
          const adDay = (adInsightsData.data || [])[0];
          if (!adDay) continue;

          const adConversions = (adDay.actions || [])
            .filter((a: any) => a.action_type === "offsite_conversion.fb_pixel_purchase" || a.action_type === "purchase")
            .reduce((s: number, a: any) => s + Number(a.value || 0), 0);

          const { error: adErr } = await adminClient.from("meta_ads").upsert({
            adset_id: adsetRow.id,
            ad_id: ad.id,
            ad_name: ad.name,
            status: ad.status,
            creative_thumbnail_url: ad.creative?.thumbnail_url ?? null,
            spend: Number(adDay.spend || 0),
            impressions: Number(adDay.impressions || 0),
            clicks: Number(adDay.clicks || 0),
            conversions: adConversions,
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let body: { ad_account_id?: string } = {};
    try { body = await req.json(); } catch { /* empty body is valid: sync-all mode */ }

    let accounts: any[];
    if (body.ad_account_id) {
      const { data: account } = await adminClient
        .from("meta_ad_accounts").select("*").eq("id", body.ad_account_id).single();
      if (!account) {
        return new Response(JSON.stringify({ error: "Account not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      accounts = [account];
    } else {
      const { data } = await adminClient.from("meta_ad_accounts").select("*").eq("is_active", true);
      accounts = data || [];
    }

    const results = [];
    for (const account of accounts) {
      results.push(await syncAccount(adminClient, account));
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

- [ ] **Step 2: Add config entry**

```toml
[functions.meta-sync]
verify_jwt = false
```

- [ ] **Step 3: Deploy**

Run: `cd lovable-hub-1 && npx supabase functions deploy meta-sync --linked`
Expected: deploy succeeds.

- [ ] **Step 4: Verify against a real connected account**

Get a real `ad_account_id` first: `npx supabase db query --linked` with `select id, account_name from public.meta_ad_accounts where is_active = true limit 1;`. Then:
```bash
curl -sS -X POST "https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/meta-sync" \
  -H "Content-Type: application/json" -d '{"ad_account_id":"<the-id>"}'
```
Expected: `{"success":true,"results":[{"account_id":"...","synced_campaigns":N,...}]}` with no `error` field. Then verify with `select count(*) from public.meta_ads where date = current_date;` — expect > 0 if the account has active ads with spend today. Also run the same curl with body `{}` and confirm it processes every active account (results array length matches active account count).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/meta-sync/index.ts supabase/config.toml
git commit -m "feat: extend meta-sync to ad-set/ad level insights and sync-all mode"
git push origin HEAD
```

---

### Task 5: `meta-capi` edge function

**Files:**
- Create: `supabase/functions/meta-capi/index.ts`
- Modify: `supabase/config.toml` (add `[functions.meta-capi]` with `verify_jwt = false`)

**Interfaces:**
- Produces: `POST /functions/v1/meta-capi` accepting `{ project: 'educacional'|'nutra', event_name: string, order_id: string, value: number, currency?: string, email?: string, phone?: string, fbp?: string, fbc?: string, client_ip?: string, user_agent?: string }`. Consumed by `perfectpay-webhook` (Task 6) and `cartpanda-s2s` (Task 7).
- Consumes: Supabase secrets `META_PIXEL_ID_EDUCACIONAL` / `META_CAPI_TOKEN_EDUCACIONAL` and `META_PIXEL_ID_NUTRA` / `META_CAPI_TOKEN_NUTRA` (set manually by the user before this function is used in anger — already has Pixel ID + CAPI token per the brainstorm answers).

- [ ] **Step 1: Write the function**

```typescript
// supabase/functions/meta-capi/index.ts
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface CapiPayload {
  project: "educacional" | "nutra";
  event_name: string;
  order_id: string;
  value: number;
  currency?: string;
  email?: string;
  phone?: string;
  fbp?: string;
  fbc?: string;
  client_ip?: string;
  user_agent?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: CapiPayload;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.project || !body.order_id || typeof body.value !== "number") {
    return new Response(JSON.stringify({ error: "project, order_id and value are required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const suffix = body.project === "nutra" ? "NUTRA" : "EDUCACIONAL";
  const pixelId = Deno.env.get(`META_PIXEL_ID_${suffix}`);
  const capiToken = Deno.env.get(`META_CAPI_TOKEN_${suffix}`);

  if (!pixelId || !capiToken) {
    console.error(`meta-capi: missing pixel/token secrets for ${suffix}`);
    return new Response(JSON.stringify({ error: `CAPI not configured for ${body.project}` }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userData: Record<string, unknown> = {};
  if (body.email) userData.em = [await sha256Hex(body.email)];
  if (body.phone) userData.ph = [await sha256Hex(body.phone.replace(/\D/g, ""))];
  if (body.fbp) userData.fbp = body.fbp;
  if (body.fbc) userData.fbc = body.fbc;
  if (body.client_ip) userData.client_ip_address = body.client_ip;
  if (body.user_agent) userData.client_user_agent = body.user_agent;

  const event = {
    event_name: body.event_name || "Purchase",
    event_time: Math.floor(Date.now() / 1000),
    event_id: body.order_id,
    action_source: "website",
    user_data: userData,
    custom_data: { value: body.value, currency: body.currency || "BRL" },
  };

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${capiToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [event] }),
    }
  );
  const result = await res.json();

  if (!res.ok) {
    console.error("meta-capi: Meta API error", result);
    return new Response(JSON.stringify({ ok: false, error: result }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, result }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 2: Add config entry**

```toml
[functions.meta-capi]
verify_jwt = false
```

- [ ] **Step 3: Set the secrets (if not already present)**

Run: `cd lovable-hub-1 && npx supabase secrets list --linked` — check for `META_PIXEL_ID_EDUCACIONAL`/`META_CAPI_TOKEN_EDUCACIONAL`. If missing, get the values from the user (Pixel ID + CAPI token from Meta Events Manager → Settings → Conversions API, per the brainstorm: "já tenho Pixel ID e token prontos") and:
```bash
npx supabase secrets set --linked META_PIXEL_ID_EDUCACIONAL=<value> META_CAPI_TOKEN_EDUCACIONAL=<value>
```
Leave `META_PIXEL_ID_NUTRA`/`META_CAPI_TOKEN_NUTRA` unset until the Nutra funnel has its own pixel — `meta-capi` calls for `project: 'nutra'` will return a clean `500` with `"CAPI not configured for nutra"` until then, which Task 7 must not let block the sale write (see Task 7's fire-and-forget requirement).

- [ ] **Step 4: Deploy**

Run: `npx supabase functions deploy meta-capi --linked`
Expected: deploy succeeds.

- [ ] **Step 5: Verify with a real test event**

```bash
curl -sS -X POST "https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/meta-capi" \
  -H "Content-Type: application/json" \
  -d '{"project":"educacional","event_name":"Purchase","order_id":"test-order-001","value":97,"currency":"BRL","email":"test@example.com"}'
```
Expected: `{"ok":true,"result":{"events_received":1,...}}`. Confirm the event shows up in Meta Events Manager → Test Events (the `fbtrace_id` in `result` is Meta's confirmation it was received).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/meta-capi/index.ts supabase/config.toml
git commit -m "feat: add meta-capi server-side Conversions API function"
git push origin HEAD
```

---

### Task 6: `perfectpay-webhook` — attribution parsing + CAPI call

**Files:**
- Modify: `supabase/functions/perfectpay-webhook/index.ts`

**Interfaces:**
- Consumes: `public.ad_visits` (Task 1), `POST /functions/v1/meta-capi` (Task 5)
- Produces: `sales` rows now populated with `utm_*`, `fbclid/fbp/fbc`, `campaign_id/adset_id/ad_id`

- [ ] **Step 1: Add the parsing helper near the top of the file (after the existing `PAYMENT_METHOD_MAP` block, before `resolveProjectId`)**

```typescript
const ID_RE = /^\d{6,}$/;
function splitNameId(value?: string | null): { name: string | null; id: string | null } {
  if (!value) return { name: null, id: null };
  const raw = decodeURIComponent(String(value).replace(/\+/g, " ")).trim();
  if (!raw) return { name: null, id: null };
  const cut = raw.lastIndexOf("|");
  if (cut === -1) return ID_RE.test(raw) ? { name: null, id: raw } : { name: raw, id: null };
  const name = raw.slice(0, cut).trim() || null;
  const tail = raw.slice(cut + 1).trim();
  return { name, id: ID_RE.test(tail) ? tail : null };
}

async function resolveAttribution(
  supabase: ReturnType<typeof createClient>,
  metadata: Record<string, unknown>
): Promise<{
  utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; utm_content: string | null;
  fbclid: string | null; fbp: string | null; fbc: string | null;
  campaign_id: string | null; adset_id: string | null; ad_id: string | null;
}> {
  const utm_source = (metadata.utm_source as string) || null;
  const utm_medium = (metadata.utm_medium as string) || null;
  const utm_campaign = (metadata.utm_campaign as string) || null;
  const utm_content = (metadata.utm_content as string) || null;
  let fbclid = (metadata.fbclid as string) || null;
  let fbp = (metadata.fbp as string) || null;
  let fbc = (metadata.fbc as string) || null;

  let campaign = splitNameId(utm_campaign);
  let adset = splitNameId(utm_medium);
  let ad = splitNameId(utm_content);

  const rtVid = (metadata.rt_vid as string) || null;
  if ((!ad.id || !fbclid) && rtVid) {
    const { data: visit } = await supabase
      .from("ad_visits")
      .select("*")
      .eq("rt_vid", rtVid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (visit) {
      campaign = campaign.id ? campaign : { name: visit.campaign_name, id: visit.campaign_id };
      adset = adset.id ? adset : { name: visit.adset_name, id: visit.adset_id };
      ad = ad.id ? ad : { name: visit.ad_name, id: visit.ad_id };
      fbclid = fbclid || visit.fbclid;
      fbp = fbp || visit.fbp;
      fbc = fbc || visit.fbc;
    }
  }

  return {
    utm_source, utm_medium, utm_campaign, utm_content,
    fbclid, fbp, fbc,
    campaign_id: campaign.id, adset_id: adset.id, ad_id: ad.id,
  };
}
```

- [ ] **Step 2: Call it and merge into the sale upsert**

In the main handler, right after the existing `const metadata = payload.metadata || {};` line, add:
```typescript
    const attribution = await resolveAttribution(supabase, metadata as Record<string, unknown>);
```

Then extend the existing `sales` upsert object (the one with `code, project_id, lead_email, ...`) by adding these keys before the closing brace:
```typescript
        utm_source: attribution.utm_source,
        utm_medium: attribution.utm_medium,
        utm_campaign: attribution.utm_campaign,
        utm_content: attribution.utm_content,
        fbclid: attribution.fbclid,
        fbp: attribution.fbp,
        fbc: attribution.fbc,
        campaign_id: attribution.campaign_id,
        adset_id: attribution.adset_id,
        ad_id: attribution.ad_id,
```

- [ ] **Step 3: Fire the CAPI call after a successful approved-sale write (fire-and-forget, never blocks the response)**

Immediately after the existing `if (saleError) { console.error(...); }` block, add:
```typescript
    if (!saleError && saleStatus === "approved") {
      fetch(`${supabaseUrl}/functions/v1/meta-capi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: "educacional",
          event_name: "Purchase",
          order_id: saleCode,
          value: saleAmount,
          currency: "BRL",
          email,
          fbp: attribution.fbp,
          fbc: attribution.fbc,
        }),
      }).catch((err) => console.error("meta-capi call failed:", err));
    }
```
This is deliberately not `await`ed — the webhook must respond to PerfectPay regardless of whether the CAPI call succeeds (matches the spec's non-blocking requirement).

- [ ] **Step 4: Deploy**

Run: `cd lovable-hub-1 && npx supabase functions deploy perfectpay-webhook --linked`
Expected: deploy succeeds.

- [ ] **Step 5: Verify with a synthetic webhook payload**

First insert a matching `ad_visits` row to exercise the `rt_vid` recovery path (`npx supabase db query --linked`):
```sql
insert into public.ad_visits (rt_vid, project, campaign_id, adset_id, ad_id, campaign_name, adset_name, ad_name, fbclid)
values ('22222222-2222-2222-2222-222222222222', 'educacional', '999000001', '999000002', '999000003', 'Camp Teste', 'Conj Teste', 'Ad Teste', 'fb.test.123');
```
Then POST a sale payload missing UTMs but carrying `rt_vid` in metadata:
```bash
curl -sS -X POST "https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/perfectpay-webhook" \
  -H "Content-Type: application/json" \
  -d '{"code":"TEST-ATTR-001","customer":{"email":"attrtest@example.com","full_name":"Attr Test"},"sale_amount":"97.00","sale_status_enum":2,"product":{"code":"P1","name":"Produto Teste"},"metadata":{"rt_vid":"22222222-2222-2222-2222-222222222222"}}'
```
Expected: `{"success":true,"status":"approved"}`. Then `select ad_id, campaign_id, fbclid from public.sales where code = 'TEST-ATTR-001';` — expect `ad_id = '999000003'`, `campaign_id = '999000001'`, `fbclid = 'fb.test.123'` (recovered from the visit).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/perfectpay-webhook/index.ts
git commit -m "feat: attribute PerfectPay sales to their originating ad, fire CAPI purchase event"
git push origin HEAD
```

---

### Task 7: `cartpanda-s2s` — attribution parsing + CAPI call

**Files:**
- Modify: `supabase/functions/cartpanda-s2s/index.ts`

**Interfaces:**
- Consumes: `public.ad_visits` (Task 1), `POST /functions/v1/meta-capi` (Task 5)
- Produces: `nutra_sales` rows now populated with `fbclid/fbp/fbc`, `campaign_id/adset_id/ad_id`

- [ ] **Step 1: Add the same `splitNameId` + attribution resolver used in Task 6, adapted for this file's payload shape**

At the top of the file, after the `corsHeaders` const, add:
```typescript
const ID_RE = /^\d{6,}$/;
function splitNameId(value?: string | null): { name: string | null; id: string | null } {
  if (!value) return { name: null, id: null };
  const raw = decodeURIComponent(String(value).replace(/\+/g, " ")).trim();
  if (!raw) return { name: null, id: null };
  const cut = raw.lastIndexOf("|");
  if (cut === -1) return ID_RE.test(raw) ? { name: null, id: raw } : { name: raw, id: null };
  const name = raw.slice(0, cut).trim() || null;
  const tail = raw.slice(cut + 1).trim();
  return { name, id: ID_RE.test(tail) ? tail : null };
}

async function resolveAttribution(adminClient: any, payload: any) {
  const findAttr = (key: string) =>
    payload[key] || payload.note_attributes?.find((n: any) => n.name === key)?.value || null;

  const utm_campaign = findAttr("utm_campaign");
  const utm_medium = findAttr("utm_medium");
  const utm_content = findAttr("utm_content");
  let fbclid = findAttr("fbclid");
  let fbp = findAttr("fbp");
  let fbc = findAttr("fbc");

  let campaign = splitNameId(utm_campaign);
  let adset = splitNameId(utm_medium);
  let ad = splitNameId(utm_content);

  const rtVid = findAttr("rt_vid");
  if ((!ad.id || !fbclid) && rtVid) {
    const { data: visit } = await adminClient
      .from("ad_visits").select("*").eq("rt_vid", rtVid)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (visit) {
      campaign = campaign.id ? campaign : { name: visit.campaign_name, id: visit.campaign_id };
      adset = adset.id ? adset : { name: visit.adset_name, id: visit.adset_id };
      ad = ad.id ? ad : { name: visit.ad_name, id: visit.ad_id };
      fbclid = fbclid || visit.fbclid;
      fbp = fbp || visit.fbp;
      fbc = fbc || visit.fbc;
    }
  }

  return { fbclid, fbp, fbc, campaign_id: campaign.id, adset_id: adset.id, ad_id: ad.id };
}
```

- [ ] **Step 2: Call it and merge into the `sale` object**

Right after the existing `const sale = { ... utm_campaign: ..., raw_payload: payload };` object literal, replace it so attribution is resolved first and merged in:

```typescript
    const attribution = await resolveAttribution(adminClient, payload);
    const sale = {
      project_id: nutraProject.id,
      source: "cartpanda",
      order_id: payload.order_id || payload.id?.toString(),
      customer_name: payload.customer?.name || payload.billing_address?.name,
      customer_email: payload.customer?.email || payload.email,
      customer_phone: payload.customer?.phone || payload.phone,
      product_name: payload.line_items?.[0]?.title || payload.product_name,
      product_id: payload.line_items?.[0]?.product_id?.toString(),
      amount: Number(payload.total_price || payload.amount || 0),
      currency: payload.currency || "BRL",
      status: mapCartpandaStatus(payload.financial_status || payload.status),
      payment_method: payload.payment_method || payload.gateway,
      tracking_code: payload.fulfillments?.[0]?.tracking_number,
      utm_source: payload.utm_source || payload.note_attributes?.find((n: any) => n.name === "utm_source")?.value,
      utm_medium: payload.utm_medium || payload.note_attributes?.find((n: any) => n.name === "utm_medium")?.value,
      utm_campaign: payload.utm_campaign || payload.note_attributes?.find((n: any) => n.name === "utm_campaign")?.value,
      fbclid: attribution.fbclid,
      fbp: attribution.fbp,
      fbc: attribution.fbc,
      campaign_id: attribution.campaign_id,
      adset_id: attribution.adset_id,
      ad_id: attribution.ad_id,
      raw_payload: payload,
    };
```
(This replaces the existing `sale` object literal — same fields as before, plus the six new attribution fields.)

- [ ] **Step 3: Fire the CAPI call on approved sales, fire-and-forget**

Right after the existing `if (existing) { ... } else { ... }` upsert block (before the `return new Response(JSON.stringify({ success: true })...`), add:
```typescript
    if (sale.status === "approved") {
      fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/meta-capi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: "nutra",
          event_name: "Purchase",
          order_id: sale.order_id || `cartpanda-${Date.now()}`,
          value: sale.amount,
          currency: sale.currency,
          email: sale.customer_email,
          fbp: sale.fbp,
          fbc: sale.fbc,
        }),
      }).catch((err) => console.error("meta-capi call failed:", err));
    }
```

- [ ] **Step 4: Deploy**

Run: `cd lovable-hub-1 && npx supabase functions deploy cartpanda-s2s --linked`
Expected: deploy succeeds.

- [ ] **Step 5: Verify with a synthetic webhook payload**

Get the current `CARTPANDA_WEBHOOK_SECRET` value: `npx supabase secrets list --linked` shows names only, not values — ask the user for the value if not already known from a `.env` file, or temporarily read it via `npx supabase db query --linked` is not applicable (it's a function secret, not DB) — use whatever value is already configured in the CartPanda dashboard's webhook settings (the user has this). Then:
```bash
curl -sS -X POST "https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/cartpanda-s2s" \
  -H "Content-Type: application/json" \
  -H "X-Cartpanda-Token: <the-real-secret>" \
  -d '{"order_id":"TEST-NUTRA-ATTR-001","customer":{"email":"nutrattr@example.com"},"total_price":"49.90","status":"paid","utm_campaign":"CampNutra|888000001","utm_medium":"ConjNutra|888000002","utm_content":"AdNutra|888000003"}'
```
Expected: `{"success":true}`. Then `select ad_id, campaign_id from public.nutra_sales where order_id = 'TEST-NUTRA-ATTR-001';` — expect `ad_id = '888000003'`, `campaign_id = '888000001'`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/cartpanda-s2s/index.ts
git commit -m "feat: attribute CartPanda sales to their originating ad, fire CAPI purchase event"
git push origin HEAD
```

---

### Task 8: Cron schedule for `meta-sync`

**Files:**
- Create: `supabase/migrations/20260911000004_meta_sync_cron.sql`

**Interfaces:**
- Consumes: `POST /functions/v1/meta-sync` with empty body (Task 4's sync-all mode)

- [ ] **Step 1: Write the migration**

```sql
SELECT cron.schedule(
  'meta-sync-every-20min',
  '*/20 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/meta-sync',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxxcmx2ZWZlem5mYWF1d2d2dWJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NTA4NzEsImV4cCI6MjA4NjUyNjg3MX0.umhDSKFm4yQRox1EkA_eqnHR1_N6pXyX9FstT_qkrfE"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

- [ ] **Step 2: Apply**

Run: `cd lovable-hub-1 && npx supabase db push --linked --yes`
Expected: `"Finished supabase db push."`

- [ ] **Step 3: Verify the job is registered and, after waiting for one run, produced results**

Run: `npx supabase db query --linked` with `select jobname, schedule, active from cron.job where jobname = 'meta-sync-every-20min';` — expect one row, `active = true`. After waiting ~20 minutes (or trigger manually via the curl from Task 4 Step 4 in the meantime), check `select jobid, status, return_message from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'meta-sync-every-20min') order by start_time desc limit 3;` — expect `status = 'succeeded'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260911000004_meta_sync_cron.sql
git commit -m "feat(db): schedule meta-sync to run every 20 minutes"
git push origin HEAD
```

---

### Task 9: "Atribuição" tab in `/meta-ads`

**Files:**
- Modify: `src/hooks/useMetaAds.ts` (add `useAdPerformance`)
- Modify: `src/pages/nutra/MetaAds.tsx` (wrap existing content in Tabs, add new tab)

**Interfaces:**
- Consumes: view `public.ad_performance` (Task 1)
- Produces: `useAdPerformance(accountId?, since?, until?)` hook returning `{ ad_id, ad_name, adset_name, campaign_name, date, spend, impressions, clicks, sales_count, revenue, cpa, roas, profit }[]`

- [ ] **Step 1: Add the hook**

In `src/hooks/useMetaAds.ts`, after `useNutraSales` (end of file), add:
```typescript
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
```

- [ ] **Step 2: Verify the hook compiles**

Run: `cd lovable-hub-1 && npx tsc --noEmit`
Expected: no new type errors (pre-existing errors, if any, are out of scope — only check no *new* ones appear in `useMetaAds.ts`).

- [ ] **Step 3: Wrap `MetaAds.tsx` in tabs and add the attribution table**

Replace the imports at the top of `src/pages/nutra/MetaAds.tsx`:
```typescript
import { useState } from "react";
import { format, subDays } from "date-fns";
import { RefreshCw, Play, Pause, Settings2, BarChart3, AlertTriangle, ArrowRight, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMetaAdAccounts, useMetaAdCampaigns, useSyncMetaAds, useMetaAction, useMetaConnection, useAdPerformance } from "@/hooks/useMetaAds";
import { MetaRulesDialog } from "@/components/nutra/MetaRulesDialog";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
```

Then, inside `MetaAdsPage`, after the existing `const actionMutation = useMetaAction();` line, add:
```typescript
  const { data: adPerformance = [], isLoading: adPerformanceLoading } = useAdPerformance(activeAccount?.id, since, until);
```

Finally, replace the campaign `<Table>` block (the whole `<div className="glass-card overflow-hidden"> ... </div>` that currently renders unconditionally after the `legacyConnected`/`!activeAccount` checks) so it's wrapped in tabs. Change:
```typescript
      ) : (
        <div className="glass-card overflow-hidden">
          <Table>
```
to:
```typescript
      ) : (
        <Tabs defaultValue="campanhas">
          <TabsList>
            <TabsTrigger value="campanhas">Campanhas</TabsTrigger>
            <TabsTrigger value="atribuicao">
              <Link2 className="h-3.5 w-3.5 mr-1.5" />
              Atribuição
            </TabsTrigger>
          </TabsList>
          <TabsContent value="campanhas">
            <div className="glass-card overflow-hidden">
              <Table>
```

And its matching close — change the existing:
```typescript
          </Table>
        </div>
      )}
```
to:
```typescript
              </Table>
            </div>
          </TabsContent>
          <TabsContent value="atribuicao">
            <div className="glass-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Anúncio</TableHead>
                    <TableHead>Conjunto</TableHead>
                    <TableHead>Campanha</TableHead>
                    <TableHead className="text-right">Gasto</TableHead>
                    <TableHead className="text-right">Vendas</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead className="text-right">CPA</TableHead>
                    <TableHead className="text-right">ROAS</TableHead>
                    <TableHead className="text-right">Lucro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adPerformanceLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 9 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : adPerformance.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                        Nenhum anúncio com dados de atribuição no período
                      </TableCell>
                    </TableRow>
                  ) : (
                    adPerformance.map((a: any) => (
                      <TableRow key={`${a.ad_id}-${a.date}`}>
                        <TableCell className="font-medium text-sm max-w-[200px] truncate">{a.ad_name || a.ad_id}</TableCell>
                        <TableCell className="text-sm max-w-[160px] truncate">{a.adset_name || "–"}</TableCell>
                        <TableCell className="text-sm max-w-[160px] truncate">{a.campaign_name || "–"}</TableCell>
                        <TableCell className="text-right text-sm">{fmtBRL(Number(a.spend || 0))}</TableCell>
                        <TableCell className="text-right text-sm">{Number(a.sales_count || 0)}</TableCell>
                        <TableCell className="text-right text-sm">{fmtBRL(Number(a.revenue || 0))}</TableCell>
                        <TableCell className="text-right text-sm">{a.cpa != null ? fmtBRL(Number(a.cpa)) : "–"}</TableCell>
                        <TableCell className="text-right text-sm">{a.roas != null ? `${Number(a.roas).toFixed(2)}x` : "–"}</TableCell>
                        <TableCell className={`text-right text-sm ${Number(a.profit || 0) < 0 ? "text-destructive" : "text-green-600"}`}>
                          {fmtBRL(Number(a.profit || 0))}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      )}
```

- [ ] **Step 4: Verify it builds and renders**

Run: `cd lovable-hub-1 && npm run build`
Expected: build succeeds with no new errors.

Then: `npm run dev`, open `/meta-ads` (or `/nutra/meta-ads`) with a connected account, confirm both tabs render, "Atribuição" shows either real rows (if Tasks 1-8 have produced attributed sales + synced ad data) or the empty state, and switching tabs doesn't break the existing "Campanhas" tab or the Sync/Regras buttons above it.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useMetaAds.ts src/pages/nutra/MetaAds.tsx
git commit -m "feat: add Atribuição tab showing per-ad CPA/ROAS/profit"
git push origin HEAD
```

---

## Self-Review Notes

- **Spec coverage:** Goals 1-6 map to Tasks 1-3 (visit capture) + 6-7 (webhook attribution) for goal 1; Tasks 1+6+7 for goal 2 (`rt_vid` recovery); Task 4+8 for goal 3; Task 1's view for goal 4; Task 5+6+7 for goal 5; Task 9 for goal 6. Non-goals (CAPI retry queue, rules engine, Google/TikTok, ClickBank) are not touched by any task.
- **Open spec questions:** Nutra LP domain (config-only, `NUTRA_LP_ORIGINS` secret, no code change needed later) and fbclid passthrough-vs-recovery (Task 6/7 handle both paths already — whichever one CartPanda/PerfectPay actually uses in practice, the code doesn't need to change).
- **Type consistency checked:** `splitNameId`/attribution field names (`campaign_id`/`adset_id`/`ad_id`, `fbp`/`fbc`/`fbclid`) are identical across `ad-collect`, `perfectpay-webhook`, `cartpanda-s2s`, `ad_visits` columns, and `sales`/`nutra_sales` columns. `useAdPerformance`'s returned field names match `ad_performance`'s view columns exactly (Task 1 Step 1).
