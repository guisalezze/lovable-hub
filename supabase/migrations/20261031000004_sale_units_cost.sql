-- Each Nutra sale stores how many units it shipped and its product cost at sale time,
-- so later price changes in product_costs don't rewrite past profit
ALTER TABLE public.nutra_sales
  ADD COLUMN IF NOT EXISTS units integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS product_cost numeric;

-- per_order items (e.g. shipping) are charged once per order instead of per unit
ALTER TABLE public.product_costs
  ADD COLUMN IF NOT EXISTS per_order boolean NOT NULL DEFAULT false;
