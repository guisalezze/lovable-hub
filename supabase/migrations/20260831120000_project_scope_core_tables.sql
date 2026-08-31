-- 1. project_id on core CRM tables, backfilled to Educacional
ALTER TABLE public.leads ADD COLUMN project_id uuid REFERENCES public.projects(id);
ALTER TABLE public.sales ADD COLUMN project_id uuid REFERENCES public.projects(id);
ALTER TABLE public.charges ADD COLUMN project_id uuid REFERENCES public.projects(id);
ALTER TABLE public.lead_products ADD COLUMN project_id uuid REFERENCES public.projects(id);
ALTER TABLE public.calls ADD COLUMN project_id uuid REFERENCES public.projects(id);
ALTER TABLE public.onboarding_responses ADD COLUMN project_id uuid REFERENCES public.projects(id);

UPDATE public.leads SET project_id = (SELECT id FROM public.projects WHERE slug = 'educacional') WHERE project_id IS NULL;
UPDATE public.sales SET project_id = (SELECT id FROM public.projects WHERE slug = 'educacional') WHERE project_id IS NULL;
UPDATE public.charges SET project_id = (SELECT id FROM public.projects WHERE slug = 'educacional') WHERE project_id IS NULL;
UPDATE public.lead_products SET project_id = (SELECT id FROM public.projects WHERE slug = 'educacional') WHERE project_id IS NULL;
UPDATE public.calls SET project_id = (SELECT id FROM public.projects WHERE slug = 'educacional') WHERE project_id IS NULL;
UPDATE public.onboarding_responses SET project_id = (SELECT id FROM public.projects WHERE slug = 'educacional') WHERE project_id IS NULL;

-- 2. project_products: admin-managed product_code -> project mapping (fallback routing,
--    used when a project doesn't have its own dedicated webhook URL)
CREATE TABLE public.project_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'perfectpay',
  product_code text NOT NULL,
  product_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source, product_code)
);
ALTER TABLE public.project_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read project_products" ON public.project_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage project_products" ON public.project_products FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- 3. client_ltv view: append project_id (derived from sales/charges, falling back to the
--    lead's project). Column order for pre-existing columns is UNCHANGED — CREATE OR REPLACE
--    VIEW only allows appending columns at the end.
CREATE OR REPLACE VIEW public.client_ltv AS
WITH sales_data AS (
  SELECT
    lead_email AS email,
    project_id,
    COUNT(*) AS total_purchases,
    COALESCE(SUM(sale_amount), 0) AS sales_revenue,
    MIN(date_created) AS first_purchase_at,
    MAX(date_created) AS last_purchase_at
  FROM public.sales
  WHERE sale_status_enum = 'approved'
  GROUP BY lead_email, project_id
),
charges_data AS (
  SELECT
    client_email AS email,
    project_id,
    COUNT(*) AS total_charges,
    COALESCE(SUM(total_ticket), 0) AS charges_revenue
  FROM public.charges
  WHERE client_email IS NOT NULL AND status != 'cancelled'
  GROUP BY client_email, project_id
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
  SELECT email, project_id FROM sales_data
  UNION
  SELECT email, project_id FROM charges_data WHERE email IS NOT NULL
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
  END AS segment,
  COALESCE(ae.project_id, l.project_id) AS project_id
FROM all_emails ae
LEFT JOIN public.leads l ON l.email = ae.email
LEFT JOIN sales_data sd ON sd.email = ae.email AND sd.project_id = ae.project_id
LEFT JOIN charges_data cd ON cd.email = ae.email AND cd.project_id = ae.project_id
LEFT JOIN impl_data id ON id.email = ae.email;

GRANT SELECT ON public.client_ltv TO authenticated;

-- 4. search_clients: add an optional project filter (old 1-arg signature is dropped so there's
--    no ambiguous overload)
DROP FUNCTION IF EXISTS public.search_clients(text);

CREATE OR REPLACE FUNCTION public.search_clients(search_term text, p_project_id uuid DEFAULT NULL)
RETURNS SETOF public.client_ltv
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.client_ltv
  WHERE
    (email ILIKE '%' || search_term || '%' OR name ILIKE '%' || search_term || '%')
    AND (p_project_id IS NULL OR project_id = p_project_id)
  ORDER BY ltv DESC
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.search_clients(text, uuid) TO authenticated;
