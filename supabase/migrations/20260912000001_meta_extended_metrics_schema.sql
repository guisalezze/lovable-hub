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
