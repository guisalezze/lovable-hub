
CREATE OR REPLACE VIEW public.client_ltv AS
WITH all_sale_emails AS (
  SELECT DISTINCT lead_email AS email FROM public.sales
),
sales_data AS (
  SELECT
    lead_email AS email,
    COUNT(*) AS total_purchases,
    COALESCE(SUM(sale_amount) FILTER (WHERE sale_status_enum = 'approved'), 0) AS sales_revenue,
    MIN(date_created) AS first_purchase_at,
    MAX(date_created) AS last_purchase_at
  FROM public.sales
  GROUP BY lead_email
),
charges_data AS (
  SELECT
    client_email AS email,
    COUNT(*) AS total_charges,
    COALESCE(SUM(total_ticket), 0) AS charges_revenue
  FROM public.charges
  WHERE client_email IS NOT NULL AND status != 'cancelled'
  GROUP BY client_email
),
impl_data AS (
  SELECT
    client_email AS email,
    COUNT(*) AS total_implementations,
    COALESCE(SUM(total_value), 0) AS impl_revenue
  FROM public.implementations
  WHERE client_email IS NOT NULL AND status != 'cancelled'
  GROUP BY client_email
),
all_emails AS (
  SELECT email FROM all_sale_emails
  UNION
  SELECT email FROM charges_data WHERE email IS NOT NULL
  UNION
  SELECT email FROM impl_data WHERE email IS NOT NULL
)
SELECT
  ae.email,
  l.full_name AS name,
  l.phone_e164 AS phone,
  l.id AS lead_id,
  COALESCE(sd.total_purchases, 0) AS total_purchases,
  COALESCE(sd.sales_revenue, 0) AS sales_revenue,
  COALESCE(cd.total_charges, 0) AS total_charges,
  COALESCE(cd.charges_revenue, 0) AS charges_revenue,
  COALESCE(id.total_implementations, 0) AS total_implementations,
  COALESCE(id.impl_revenue, 0) AS impl_revenue,
  COALESCE(sd.sales_revenue, 0) + COALESCE(cd.charges_revenue, 0) + COALESCE(id.impl_revenue, 0) AS ltv,
  sd.first_purchase_at,
  sd.last_purchase_at,
  CASE
    WHEN COALESCE(sd.sales_revenue, 0) + COALESCE(cd.charges_revenue, 0) + COALESCE(id.impl_revenue, 0) >= 10000 THEN 'vip'
    WHEN COALESCE(sd.sales_revenue, 0) + COALESCE(cd.charges_revenue, 0) + COALESCE(id.impl_revenue, 0) >= 3000 THEN 'premium'
    WHEN COALESCE(sd.sales_revenue, 0) + COALESCE(cd.charges_revenue, 0) + COALESCE(id.impl_revenue, 0) >= 500 THEN 'regular'
    ELSE 'new'
  END AS segment
FROM all_emails ae
LEFT JOIN public.leads l ON l.email = ae.email
LEFT JOIN sales_data sd ON sd.email = ae.email
LEFT JOIN charges_data cd ON cd.email = ae.email
LEFT JOIN impl_data id ON id.email = ae.email;

GRANT SELECT ON public.client_ltv TO authenticated;
