-- Instagram OpenReply: follow gate, reconciliacao, links rastreados, leitura,
-- proximo reel, historico de seguidores e relatorios publicos.
-- Idempotente. Funcoes publicas (ig-r, ig-report) usam service_role.

-- ============================================================
-- 1. ig_flow_runs: tipo de job, tentativa, bloco de origem, status 'awaiting_read'
--    (status e text sem CHECK; 'awaiting_read' ja e aceito)
-- ============================================================
alter table public.ig_flow_runs add column if not exists kind text not null default 'resume';
alter table public.ig_flow_runs add column if not exists attempt int not null default 0;
alter table public.ig_flow_runs add column if not exists source_node text;

alter table public.ig_flow_runs drop constraint if exists ig_flow_runs_kind_check;
alter table public.ig_flow_runs
  add constraint ig_flow_runs_kind_check
  check (kind in ('resume', 'follow_recheck', 'read_fallback'));

create index if not exists ig_flow_runs_user_status_idx
  on public.ig_flow_runs (ig_user_id, status);
create index if not exists ig_flow_runs_rule_user_source_idx
  on public.ig_flow_runs (rule_id, ig_user_id, source_node);

-- ============================================================
-- 2. ig_config: controle da reconciliacao (no maximo 1x a cada 5 min)
--    (historico de seguidores fica em ig_follower_snapshots)
-- ============================================================
alter table public.ig_config add column if not exists last_reconcile_at timestamptz;

-- ============================================================
-- 3. ig_automations: proximo reel + compartilhamento de relatorio
-- ============================================================
alter table public.ig_automations add column if not exists pending_next_reel boolean not null default false;
alter table public.ig_automations add column if not exists next_reel_since timestamptz;
alter table public.ig_automations add column if not exists share_slug text;

create unique index if not exists ig_automations_share_slug_key
  on public.ig_automations (share_slug) where share_slug is not null;

-- ============================================================
-- 4. Links rastreados
-- ============================================================
create table if not exists public.ig_links (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  rule_id uuid not null references public.ig_automations(id) on delete cascade,
  node_id text not null,
  button_index int not null,
  url text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists ig_links_target_key
  on public.ig_links (rule_id, node_id, button_index, url);

create table if not exists public.ig_link_clicks (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.ig_links(id) on delete cascade,
  ig_user_id text,
  created_at timestamptz not null default now()
);

create index if not exists ig_link_clicks_link_created_idx
  on public.ig_link_clicks (link_id, created_at);

-- Totais de cliques por botao (a UI soma por regra).
-- security_invoker: respeita o RLS de quem consulta.
create or replace view public.ig_link_click_totals
  with (security_invoker = true) as
select
  l.rule_id,
  l.node_id,
  l.button_index,
  count(c.id)::int as clicks
from public.ig_links l
left join public.ig_link_clicks c on c.link_id = l.id
group by l.rule_id, l.node_id, l.button_index;

-- ============================================================
-- 5. Historico de seguidores (1x/dia, gravado pelo worker)
-- ============================================================
create table if not exists public.ig_follower_snapshots (
  day date primary key,
  followers int not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 6. RLS (padrao v1: autenticado; edges publicas usam service_role)
-- ============================================================
alter table public.ig_links enable row level security;
alter table public.ig_link_clicks enable row level security;
alter table public.ig_follower_snapshots enable row level security;

drop policy if exists "auth_ig_links" on public.ig_links;
create policy "auth_ig_links" on public.ig_links for all using (auth.role() = 'authenticated');

drop policy if exists "auth_ig_link_clicks" on public.ig_link_clicks;
create policy "auth_ig_link_clicks" on public.ig_link_clicks for all using (auth.role() = 'authenticated');

drop policy if exists "auth_ig_follower_snapshots" on public.ig_follower_snapshots;
create policy "auth_ig_follower_snapshots" on public.ig_follower_snapshots for all using (auth.role() = 'authenticated');
