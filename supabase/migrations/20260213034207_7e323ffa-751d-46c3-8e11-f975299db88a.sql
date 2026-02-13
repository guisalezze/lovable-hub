
-- Create app role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'team');

-- Create lead status enum
CREATE TYPE public.lead_status AS ENUM ('novo', 'quase_comprou', 'comprou', 'perdido');

-- Create sale status enum
CREATE TYPE public.sale_status AS ENUM ('approved', 'pending', 'refunded', 'chargeback', 'canceled', 'blocked', 'complete');

-- Create task status enum
CREATE TYPE public.task_status AS ENUM ('backlog', 'em_andamento', 'concluido');

-- Create call status enum
CREATE TYPE public.call_status AS ENUM ('scheduled', 'completed', 'canceled', 'no_show');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles table (separate from profiles per security requirements)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'team',
  UNIQUE(user_id, role)
);

-- Leads table
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  phone_e164 TEXT,
  phone_formatted TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  status lead_status NOT NULL DEFAULT 'novo',
  last_sale_status_enum TEXT,
  last_sale_amount NUMERIC(12,2),
  last_product TEXT,
  last_date_created TIMESTAMPTZ,
  last_date_approved TIMESTAMPTZ,
  last_payment_type TEXT,
  last_billet_url TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  src TEXT,
  owner_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sales table
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  lead_email TEXT NOT NULL REFERENCES public.leads(email) ON UPDATE CASCADE,
  sale_amount NUMERIC(12,2),
  sale_status_enum TEXT,
  sale_status_detail TEXT,
  product_code TEXT,
  product_name TEXT,
  plan_code TEXT,
  plan_name TEXT,
  payment_type_enum TEXT,
  payment_method_enum TEXT,
  checkout_type_enum TEXT,
  billet_url TEXT,
  date_created TIMESTAMPTZ,
  date_approved TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lead products table
CREATE TABLE public.lead_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_email TEXT NOT NULL REFERENCES public.leads(email) ON UPDATE CASCADE,
  product_code TEXT NOT NULL,
  product_name TEXT,
  plan_code TEXT,
  total_purchases_count INT NOT NULL DEFAULT 1,
  total_paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  last_purchase_at TIMESTAMPTZ,
  last_status_enum TEXT,
  UNIQUE(lead_email, product_code)
);

-- Calls table
CREATE TABLE public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_email TEXT REFERENCES public.leads(email) ON UPDATE CASCADE,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  status call_status NOT NULL DEFAULT 'scheduled',
  meet_link TEXT,
  google_event_id TEXT,
  owner_user_id UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tasks table
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  owner_user_id UUID REFERENCES auth.users(id),
  status task_status NOT NULL DEFAULT 'backlog',
  due_date DATE,
  lead_email TEXT REFERENCES public.leads(email) ON UPDATE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Investments table (for manual tracking)
CREATE TABLE public.investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount NUMERIC(12,2) NOT NULL,
  description TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Webhook logs table
CREATE TABLE public.webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'perfectpay',
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  -- First user gets admin role, rest get team
  IF (SELECT COUNT(*) FROM public.user_roles) = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'team');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS POLICIES

-- Profiles: all authenticated can read, users update own
CREATE POLICY "Authenticated can read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- User roles: all authenticated can read
CREATE POLICY "Authenticated can read roles" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Leads: all authenticated can CRUD (team-shared)
CREATE POLICY "Authenticated can read leads" ON public.leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert leads" ON public.leads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update leads" ON public.leads FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins can delete leads" ON public.leads FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Sales: all authenticated can read, admins can modify
CREATE POLICY "Authenticated can read sales" ON public.sales FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage sales" ON public.sales FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Lead products: all authenticated can read
CREATE POLICY "Authenticated can read lead_products" ON public.lead_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage lead_products" ON public.lead_products FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Calls: all authenticated CRUD
CREATE POLICY "Authenticated can read calls" ON public.calls FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert calls" ON public.calls FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update calls" ON public.calls FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete calls" ON public.calls FOR DELETE TO authenticated USING (true);

-- Tasks: all authenticated CRUD
CREATE POLICY "Authenticated can read tasks" ON public.tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert tasks" ON public.tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update tasks" ON public.tasks FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete tasks" ON public.tasks FOR DELETE TO authenticated USING (true);

-- Investments: admin only
CREATE POLICY "Admins can manage investments" ON public.investments FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Webhook logs: admin only read, service role writes
CREATE POLICY "Admins can read webhook_logs" ON public.webhook_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Indexes
CREATE INDEX idx_leads_email ON public.leads(email);
CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_sales_lead_email ON public.sales(lead_email);
CREATE INDEX idx_sales_code ON public.sales(code);
CREATE INDEX idx_lead_products_lead_email ON public.lead_products(lead_email);
CREATE INDEX idx_calls_start_at ON public.calls(start_at);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_owner ON public.tasks(owner_user_id);
