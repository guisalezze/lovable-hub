-- Instagram Automation: tabelas de configuração, automações, fila e eventos

create table if not exists public.ig_config (
  id uuid primary key default gen_random_uuid(),
  instagram_user_id text unique not null,
  username text,
  name text,
  profile_picture_url text,
  access_token text not null,
  token_expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.ig_automations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean default true,
  triggers text[] default array['comment'],
  keywords text[] not null default array[]::text[],
  match_type text default 'contains',
  post_id text,
  public_replies text[],
  welcome_dm text,
  quick_reply_label text,
  link_text text,
  link_button_label text,
  link_url text,
  reminder_text text,
  reminder_delay_minutes integer default 60,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.ig_contacts (
  id uuid primary key default gen_random_uuid(),
  instagram_user_id text unique not null,
  username text,
  first_contact_at timestamptz default now(),
  last_reply_at timestamptz,
  last_automation_id uuid references public.ig_automations(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.ig_queue (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid references public.ig_automations(id) on delete set null,
  contact_id uuid references public.ig_contacts(id) on delete set null,
  recipient_ig_user_id text not null,
  recipient_comment_id text,
  message_type text not null,
  message_body jsonb not null,
  status text default 'pending',
  claimed_at timestamptz,
  scheduled_at timestamptz default now(),
  sent_at timestamptz,
  error text,
  created_at timestamptz default now()
);

create table if not exists public.ig_events (
  id uuid primary key default gen_random_uuid(),
  event_type text,
  payload jsonb not null,
  processed boolean default false,
  created_at timestamptz default now()
);

-- RLS ligado, sem políticas = só service_role acessa no servidor
alter table public.ig_config enable row level security;
alter table public.ig_automations enable row level security;
alter table public.ig_contacts enable row level security;
alter table public.ig_queue enable row level security;
alter table public.ig_events enable row level security;

-- Políticas para usuários autenticados (o CRM usa sessão)
create policy "auth_ig_config" on public.ig_config for all using (auth.role() = 'authenticated');
create policy "auth_ig_automations" on public.ig_automations for all using (auth.role() = 'authenticated');
create policy "auth_ig_contacts" on public.ig_contacts for all using (auth.role() = 'authenticated');
create policy "auth_ig_queue" on public.ig_queue for all using (auth.role() = 'authenticated');
create policy "auth_ig_events" on public.ig_events for all using (auth.role() = 'authenticated');

-- Índices
create index if not exists ig_queue_pending on public.ig_queue(status, scheduled_at) where status = 'pending';
create index if not exists ig_contacts_ig_uid on public.ig_contacts(instagram_user_id);
