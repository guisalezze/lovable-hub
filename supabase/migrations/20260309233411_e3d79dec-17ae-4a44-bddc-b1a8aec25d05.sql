
-- ── Templates de etapas ──────────────────────────────────────────────────────
create table if not exists public.implementation_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Padrão',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.implementation_template_steps (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.implementation_templates(id) on delete cascade,
  title text not null,
  description text,
  order_index int not null default 0
);

-- ── Implementações ───────────────────────────────────────────────────────────
create table if not exists public.implementations (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  client_email text,
  client_phone text,
  lead_id uuid references public.leads(id) on delete set null,
  description text,
  contract_start date not null,
  contract_end date not null,
  total_value numeric(10,2) not null default 0,
  charge_id uuid references public.charges(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  status text not null default 'active'
    check (status in ('active','completed','paused','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists implementations_assigned_to_idx on public.implementations(assigned_to);
create index if not exists implementations_status_idx on public.implementations(status);
create index if not exists implementations_contract_end_idx on public.implementations(contract_end);

-- ── Etapas/marcos de cada implementação ──────────────────────────────────────
create table if not exists public.implementation_steps (
  id uuid primary key default gen_random_uuid(),
  implementation_id uuid not null references public.implementations(id) on delete cascade,
  title text not null,
  description text,
  order_index int not null default 0,
  status text not null default 'pending'
    check (status in ('pending','in_progress','done')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists impl_steps_implementation_id_idx on public.implementation_steps(implementation_id);

-- ── Documentos/links entregues ───────────────────────────────────────────────
create table if not exists public.implementation_documents (
  id uuid primary key default gen_random_uuid(),
  implementation_id uuid not null references public.implementations(id) on delete cascade,
  title text not null,
  url text,
  type text default 'link' check (type in ('link','doc','video','sheet','other')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists impl_docs_implementation_id_idx on public.implementation_documents(implementation_id);

-- ── Anotações de progresso ───────────────────────────────────────────────────
create table if not exists public.implementation_notes (
  id uuid primary key default gen_random_uuid(),
  implementation_id uuid not null references public.implementations(id) on delete cascade,
  content text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists impl_notes_implementation_id_idx on public.implementation_notes(implementation_id);

-- ── Trigger updated_at ──────────────────────────────────────────────────────
create trigger set_implementations_updated_at
  before update on public.implementations
  for each row execute function public.update_updated_at_column();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.implementation_templates enable row level security;
alter table public.implementation_template_steps enable row level security;
alter table public.implementations enable row level security;
alter table public.implementation_steps enable row level security;
alter table public.implementation_documents enable row level security;
alter table public.implementation_notes enable row level security;

create policy "impl_templates_select" on public.implementation_templates for select to authenticated using (true);
create policy "impl_templates_write" on public.implementation_templates for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "impl_template_steps_select" on public.implementation_template_steps for select to authenticated using (true);
create policy "impl_template_steps_write" on public.implementation_template_steps for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create policy "implementations_select" on public.implementations for select to authenticated using (true);
create policy "implementations_insert" on public.implementations for insert to authenticated with check (true);
create policy "implementations_update" on public.implementations for update to authenticated using (public.has_role(auth.uid(),'admin') or assigned_to = auth.uid());
create policy "implementations_delete" on public.implementations for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create policy "impl_steps_all" on public.implementation_steps for all to authenticated using (true) with check (true);
create policy "impl_docs_all" on public.implementation_documents for all to authenticated using (true) with check (true);
create policy "impl_notes_all" on public.implementation_notes for all to authenticated using (true) with check (true);
