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
