
-- 1. Projects table
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  icon text DEFAULT '📁',
  color text DEFAULT '#f59e0b',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read projects" ON public.projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage projects" ON public.projects FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Seed projects
INSERT INTO public.projects (name, slug, icon, color) VALUES
  ('Educacional', 'educacional', '📚', '#3b82f6'),
  ('Nutra', 'nutra', '💊', '#10b981');

-- 2. User project access
CREATE TABLE public.user_project_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, project_id)
);
ALTER TABLE public.user_project_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own access" ON public.user_project_access FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage access" ON public.user_project_access FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Give all existing admins access to both projects
INSERT INTO public.user_project_access (user_id, project_id)
SELECT ur.user_id, p.id
FROM public.user_roles ur
CROSS JOIN public.projects p
WHERE ur.role = 'admin'
ON CONFLICT DO NOTHING;

-- Give all existing team members access to educacional
INSERT INTO public.user_project_access (user_id, project_id)
SELECT ur.user_id, p.id
FROM public.user_roles ur
JOIN public.projects p ON p.slug = 'educacional'
WHERE ur.role = 'team'
ON CONFLICT DO NOTHING;

-- 3. Add project_id to tasks
ALTER TABLE public.tasks ADD COLUMN project_id uuid REFERENCES public.projects(id);

-- Migrate existing tasks to educacional
UPDATE public.tasks SET project_id = (SELECT id FROM public.projects WHERE slug = 'educacional');

-- 4. get_my_projects function
CREATE OR REPLACE FUNCTION public.get_my_projects()
RETURNS SETOF public.projects
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.* FROM public.projects p
  WHERE EXISTS (
    SELECT 1 FROM public.user_project_access upa
    WHERE upa.project_id = p.id AND upa.user_id = auth.uid()
  )
  ORDER BY p.name;
$$;

-- 5. Meta Ads tables for Nutra
CREATE TABLE public.meta_ad_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id),
  account_id text NOT NULL,
  account_name text,
  access_token text NOT NULL,
  token_expires_at timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, account_id)
);
ALTER TABLE public.meta_ad_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage meta_ad_accounts" ON public.meta_ad_accounts FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Team can read meta_ad_accounts" ON public.meta_ad_accounts FOR SELECT TO authenticated USING (true);

CREATE TABLE public.meta_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id uuid NOT NULL REFERENCES public.meta_ad_accounts(id) ON DELETE CASCADE,
  campaign_id text NOT NULL,
  campaign_name text,
  status text DEFAULT 'ACTIVE',
  objective text,
  daily_budget numeric,
  lifetime_budget numeric,
  spend numeric DEFAULT 0,
  impressions bigint DEFAULT 0,
  clicks bigint DEFAULT 0,
  conversions bigint DEFAULT 0,
  revenue numeric DEFAULT 0,
  cpa numeric,
  roas numeric,
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.meta_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage meta_campaigns" ON public.meta_campaigns FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Team can read meta_campaigns" ON public.meta_campaigns FOR SELECT TO authenticated USING (true);

CREATE TABLE public.meta_adsets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.meta_campaigns(id) ON DELETE CASCADE,
  adset_id text NOT NULL,
  adset_name text,
  status text DEFAULT 'ACTIVE',
  daily_budget numeric,
  spend numeric DEFAULT 0,
  impressions bigint DEFAULT 0,
  clicks bigint DEFAULT 0,
  conversions bigint DEFAULT 0,
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.meta_adsets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage meta_adsets" ON public.meta_adsets FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Team can read meta_adsets" ON public.meta_adsets FOR SELECT TO authenticated USING (true);

CREATE TABLE public.meta_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adset_id uuid NOT NULL REFERENCES public.meta_adsets(id) ON DELETE CASCADE,
  ad_id text NOT NULL,
  ad_name text,
  status text DEFAULT 'ACTIVE',
  creative_thumbnail_url text,
  spend numeric DEFAULT 0,
  impressions bigint DEFAULT 0,
  clicks bigint DEFAULT 0,
  conversions bigint DEFAULT 0,
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.meta_ads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage meta_ads" ON public.meta_ads FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Team can read meta_ads" ON public.meta_ads FOR SELECT TO authenticated USING (true);

CREATE TABLE public.meta_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id uuid NOT NULL REFERENCES public.meta_ad_accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean DEFAULT true,
  condition_metric text NOT NULL,
  condition_operator text NOT NULL,
  condition_value numeric NOT NULL,
  condition_period text DEFAULT '1d',
  action_type text NOT NULL,
  action_value text,
  last_triggered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.meta_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage meta_rules" ON public.meta_rules FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.meta_custom_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id uuid NOT NULL REFERENCES public.meta_ad_accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  formula text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.meta_custom_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage meta_custom_metrics" ON public.meta_custom_metrics FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- 6. Nutra sales
CREATE TABLE public.nutra_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id),
  source text NOT NULL,
  order_id text,
  customer_name text,
  customer_email text,
  customer_phone text,
  product_name text,
  product_id text,
  amount numeric DEFAULT 0,
  currency text DEFAULT 'BRL',
  status text DEFAULT 'pending',
  payment_method text,
  tracking_code text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  raw_payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nutra_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage nutra_sales" ON public.nutra_sales FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Team can read nutra_sales" ON public.nutra_sales FOR SELECT TO authenticated USING (true);

-- 7. Update handle_new_user to give access to educacional by default
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  
  IF (SELECT COUNT(*) FROM public.user_roles) = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
    -- Admin gets access to all projects
    INSERT INTO public.user_project_access (user_id, project_id)
    SELECT NEW.id, p.id FROM public.projects p;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'team');
    -- Team gets access to educacional by default
    INSERT INTO public.user_project_access (user_id, project_id)
    SELECT NEW.id, p.id FROM public.projects p WHERE p.slug = 'educacional';
  END IF;
  
  RETURN NEW;
END;
$$;
