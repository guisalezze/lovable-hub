-- Tabela principal de cobranças
CREATE TABLE IF NOT EXISTS public.charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name text NOT NULL,
  client_name text NOT NULL,
  client_phone text,
  total_ticket numeric(10,2) NOT NULL,
  entry_paid numeric(10,2) NOT NULL DEFAULT 0,
  installments_count int NOT NULL DEFAULT 1,
  installment_value numeric(10,2) NOT NULL,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tabela de parcelas
CREATE TABLE IF NOT EXISTS public.charge_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id uuid NOT NULL REFERENCES public.charges(id) ON DELETE CASCADE,
  installment_number int NOT NULL,
  due_date date NOT NULL,
  amount numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS charges_assigned_to_idx ON public.charges(assigned_to);
CREATE INDEX IF NOT EXISTS charges_status_idx ON public.charges(status);
CREATE INDEX IF NOT EXISTS charge_installments_charge_id_idx ON public.charge_installments(charge_id);
CREATE INDEX IF NOT EXISTS charge_installments_due_date_idx ON public.charge_installments(due_date);
CREATE INDEX IF NOT EXISTS charge_installments_status_idx ON public.charge_installments(status);

-- Triggers de updated_at
CREATE TRIGGER set_charges_updated_at
  BEFORE UPDATE ON public.charges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_charge_installments_updated_at
  BEFORE UPDATE ON public.charge_installments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charge_installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "charges_select" ON public.charges FOR SELECT TO authenticated USING (true);
CREATE POLICY "charges_insert" ON public.charges FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "charges_update" ON public.charges FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR assigned_to = auth.uid());
CREATE POLICY "charges_delete" ON public.charges FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "installments_select" ON public.charge_installments FOR SELECT TO authenticated USING (true);
CREATE POLICY "installments_insert" ON public.charge_installments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "installments_update" ON public.charge_installments FOR UPDATE TO authenticated USING (true);
CREATE POLICY "installments_delete" ON public.charge_installments FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));