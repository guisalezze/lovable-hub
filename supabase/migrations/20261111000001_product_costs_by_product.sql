-- Product cost rules per product and per kit size.
-- product_match: words matched against the sale's product name, separated by "|"
--   (empty = every product). Example: 'lymph' or 'reallugen|collagen'.
-- min_units / max_units: the row only applies when the sale's units are in range
--   (empty = no limit). Used for shipping that is the same for 1 to 3 bottles, etc.
ALTER TABLE public.product_costs
  ADD COLUMN IF NOT EXISTS product_match text,
  ADD COLUMN IF NOT EXISTS min_units integer,
  ADD COLUMN IF NOT EXISTS max_units integer;

-- Fulfillment sheet (USA): bottle cost per product + packaging/handling/shipping per order by kit size
DELETE FROM public.product_costs
WHERE project_id = (SELECT id FROM public.projects WHERE slug = 'nutra')
  AND item_code IN ('FS-0003-60-01', 'Pkg - Bubble Pack', 'Pkg - Mailers', 'P1', 'P2', 'Ship&Handling');

INSERT INTO public.product_costs (project_id, item_code, unit_cost, qty_per_sale, per_order, product_match, min_units, max_units)
SELECT p.id, v.item_code, v.unit_cost, 1, v.per_order, v.product_match, v.min_units, v.max_units
FROM public.projects p
CROSS JOIN (VALUES
  ('Pote Lymphalive',   4.00, false, 'lymph',              NULL::int, NULL::int),
  ('Pote Reallugen',    7.00, false, 'reallugen|collagen', NULL,      NULL),
  ('Envio 1 a 3 potes', 8.62, true,  NULL,                 NULL,      3),
  ('Envio 4 a 6 potes', 11.46, true, NULL,                 4,         6),
  ('Envio 7 a 9 potes', 13.71, true, NULL,                 7,         9),
  ('Envio 10+ potes',   15.64, true, NULL,                 10,        NULL)
) AS v(item_code, unit_cost, per_order, product_match, min_units, max_units)
WHERE p.slug = 'nutra'
ON CONFLICT (project_id, item_code) DO NOTHING;

-- Re-price the Nutra sales already recorded with the new rules
UPDATE public.nutra_sales s
SET product_cost = sub.cost
FROM (
  SELECT s2.id, round(coalesce(sum(c.unit_cost * c.qty_per_sale * CASE WHEN c.per_order THEN 1 ELSE s2.units END), 0), 2) AS cost
  FROM public.nutra_sales s2
  JOIN public.product_costs c ON c.project_id = s2.project_id
  WHERE (c.min_units IS NULL OR s2.units >= c.min_units)
    AND (c.max_units IS NULL OR s2.units <= c.max_units)
    AND (coalesce(c.product_match, '') = '' OR EXISTS (
      SELECT 1 FROM unnest(string_to_array(lower(c.product_match), '|')) AS w
      WHERE btrim(w) <> '' AND lower(coalesce(s2.product_name, '')) LIKE '%' || btrim(w) || '%'))
  GROUP BY s2.id
) sub
WHERE s.id = sub.id;
