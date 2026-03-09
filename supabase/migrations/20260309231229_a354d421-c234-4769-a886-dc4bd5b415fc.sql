
-- product_goals table
CREATE TABLE IF NOT EXISTS public.product_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name text NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  goal_amount numeric(10,2) NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_goals_period_idx ON public.product_goals(period_start, period_end);
ALTER TABLE public.product_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_goals_select" ON public.product_goals FOR SELECT TO authenticated USING (true);
CREATE POLICY "product_goals_insert" ON public.product_goals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "product_goals_update" ON public.product_goals FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "product_goals_delete" ON public.product_goals FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER set_product_goals_updated_at
  BEFORE UPDATE ON public.product_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- onboarding_responses table
CREATE TABLE IF NOT EXISTS public.onboarding_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  charge_id uuid REFERENCES public.charges(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  full_name text,
  phone text,
  niche text,
  current_revenue text,
  main_goal text,
  expectations text,
  availability text,
  how_found text,
  status text NOT NULL DEFAULT 'pending',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onboarding_token_idx ON public.onboarding_responses(token);
CREATE INDEX IF NOT EXISTS onboarding_lead_id_idx ON public.onboarding_responses(lead_id);

ALTER TABLE public.onboarding_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "onboarding_select" ON public.onboarding_responses FOR SELECT TO authenticated USING (true);
CREATE POLICY "onboarding_insert" ON public.onboarding_responses FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "onboarding_update" ON public.onboarding_responses FOR UPDATE TO anon, authenticated USING (true);

CREATE TRIGGER set_onboarding_updated_at
  BEFORE UPDATE ON public.onboarding_responses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Validation trigger for onboarding status
CREATE OR REPLACE FUNCTION public.validate_onboarding_status()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('pending', 'completed') THEN
    RAISE EXCEPTION 'Invalid onboarding status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_onboarding_status_trigger
  BEFORE INSERT OR UPDATE ON public.onboarding_responses
  FOR EACH ROW EXECUTE FUNCTION public.validate_onboarding_status();
