-- Unit costs per project (product, packaging, inserts, shipping), deducted from each
-- approved sale in Financeiro: cost per sale = sum(unit_cost * qty_per_sale)
CREATE TABLE IF NOT EXISTS public.product_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  item_code text NOT NULL,
  unit_cost numeric NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  qty_per_sale numeric NOT NULL DEFAULT 1 CHECK (qty_per_sale >= 0),
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, item_code)
);

ALTER TABLE public.product_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage product_costs" ON public.product_costs
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Supplier invoice unit prices ("Price Each")
INSERT INTO public.product_costs (project_id, item_code, unit_cost, qty_per_sale)
SELECT p.id, v.item_code, v.unit_cost, 1
FROM public.projects p
CROSS JOIN (VALUES
  ('FS-0003-60-01', 4.00),
  ('Pkg - Bubble Pack', 0.13),
  ('Pkg - Mailers', 0.15),
  ('P1', 0.75),
  ('P2', 0.25),
  ('Ship&Handling', 13.46)
) AS v(item_code, unit_cost)
WHERE p.slug = 'nutra'
ON CONFLICT (project_id, item_code) DO NOTHING;
