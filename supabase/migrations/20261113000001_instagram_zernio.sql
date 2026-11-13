-- Instagram: campanhas no modelo OpenReply, conectadas pelo Zernio.
-- Spec: docs/superpowers/specs/2026-11-13-instagram-campanhas-zernio-design.md (seção 1).
--
-- As tabelas antigas (ig_automations, ig_flow_runs, ig_replies, ig_links, ig_link_clicks,
-- ig_follower_snapshots, ig_config, ig_queue, ig_events) NÃO são alteradas nem apagadas.
-- ig_contacts continua em uso.
--
-- Observação: o nome "ig_link_clicks" já pertence à tabela antiga (cliques de ig_links),
-- então os cliques dos links rastreados das campanhas ficam em "ig_tracked_link_clicks".

-- ============================================================
-- 0. Auxiliar para checks de arrays de texto
-- ============================================================
create or replace function public.ig_max_elem_len(arr text[])
returns int
language sql
immutable
set search_path = public
as $$
  select coalesce(max(char_length(x)), 0) from unnest(arr) as x;
$$;

-- ============================================================
-- 1. ig_zernio (linha única; só service_role)
-- ============================================================
create table if not exists public.ig_zernio (
  id int primary key default 1 check (id = 1),
  profile_id text,
  account_id text,
  ig_user_id text,
  username text,
  followers_count int,
  webhook_id text,
  webhook_secret text,
  last_reconcile_at timestamptz,
  last_worker_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.ig_zernio (id) values (1) on conflict (id) do nothing;

drop trigger if exists ig_zernio_updated_at on public.ig_zernio;
create trigger ig_zernio_updated_at
  before update on public.ig_zernio
  for each row execute function public.update_updated_at_column();

-- ============================================================
-- 2. ig_campaigns
-- ============================================================
create table if not exists public.ig_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  active boolean not null default true,

  -- Post
  post_mode text not null default 'post' check (post_mode in ('post', 'any', 'next_reel')),
  post_id text,
  post_url text,
  post_label text check (post_label is null or char_length(post_label) <= 80),
  next_reel_since timestamptz,

  -- Palavras
  keywords text[] not null default '{}'
    check (cardinality(keywords) <= 10 and public.ig_max_elem_len(keywords) <= 50),
  match_any boolean not null default false,
  whole_word boolean not null default true,
  dm_trigger boolean not null default false,

  -- Resposta pública
  public_reply_enabled boolean not null default false,
  public_replies text[] not null default '{}'
    check (cardinality(public_replies) <= 10 and public.ig_max_elem_len(public_replies) <= 1000),

  -- DM de abertura
  opening_enabled boolean not null default false,
  opening_message text check (opening_message is null or char_length(opening_message) <= 640),
  opening_button text check (opening_button is null or char_length(opening_button) <= 20),

  -- Mensagem final
  dm_message text not null check (char_length(dm_message) <= 1000),

  -- Links
  link1_label text check (link1_label is null or char_length(link1_label) <= 20),
  link1_url text check (link1_url is null or link1_url ~* '^https?://'),
  link2_label text check (link2_label is null or char_length(link2_label) <= 20),
  link2_url text check (link2_url is null or link2_url ~* '^https?://'),

  -- Seguir
  require_follow boolean not null default false,
  follow_message text check (follow_message is null or char_length(follow_message) <= 640),
  follow_button text default 'Já estou seguindo ✅'
    check (follow_button is null or char_length(follow_button) <= 20),

  -- Follow-up
  followup_enabled boolean not null default false,
  followup_message text check (followup_message is null or char_length(followup_message) <= 1000),
  followup_delay_min int not null default 60 check (followup_delay_min between 0 and 1440),

  -- Relatório público
  share_slug text unique,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ig_campaigns_post_required check (post_mode <> 'post' or post_id is not null),
  constraint ig_campaigns_keywords_required check (match_any or cardinality(keywords) > 0),
  -- Com botões de link a mensagem final vai num template de botões (limite 640).
  constraint ig_campaigns_dm_with_buttons check (
    (link1_url is null and link2_url is null) or char_length(dm_message) <= 640
  )
);

create index if not exists ig_campaigns_active_created_idx
  on public.ig_campaigns (active, created_at);

drop trigger if exists ig_campaigns_updated_at on public.ig_campaigns;
create trigger ig_campaigns_updated_at
  before update on public.ig_campaigns
  for each row execute function public.update_updated_at_column();

-- ============================================================
-- 3. ig_dm_logs (authenticated lê; escrita só service_role)
-- ============================================================
create table if not exists public.ig_dm_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.ig_campaigns(id) on delete cascade,
  trigger_ref text not null,
  source text check (source is null or source in ('webhook', 'polling', 'dm', 'button', 'read', 'followup')),
  ig_user_id text,
  username text,
  trigger_text text,
  matched_keyword text,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'skipped_dedup', 'skipped_rate_limit', 'unconfirmed')),
  attempts int not null default 0,
  error text,
  sent_at timestamptz,
  public_status text check (public_status is null or public_status in ('sent', 'failed', 'unconfirmed')),
  public_error text,
  public_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ig_dm_logs_campaign_trigger_key unique (campaign_id, trigger_ref)
);

create index if not exists ig_dm_logs_created_idx on public.ig_dm_logs (created_at desc);
create index if not exists ig_dm_logs_campaign_created_idx on public.ig_dm_logs (campaign_id, created_at);
create index if not exists ig_dm_logs_user_created_idx on public.ig_dm_logs (ig_user_id, created_at);
create index if not exists ig_dm_logs_trigger_ref_idx on public.ig_dm_logs (trigger_ref);

drop trigger if exists ig_dm_logs_updated_at on public.ig_dm_logs;
create trigger ig_dm_logs_updated_at
  before update on public.ig_dm_logs
  for each row execute function public.update_updated_at_column();

-- ============================================================
-- 4. ig_jobs (fila; só service_role)
-- ============================================================
create table if not exists public.ig_jobs (
  id bigserial primary key,
  kind text not null check (kind in ('comment', 'message', 'postback', 'read', 'followup', 'follow_recheck')),
  payload jsonb not null,
  dedupe_key text unique,
  run_at timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'dead')),
  attempts int not null default 0,
  last_error text,
  locked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ig_jobs_status_run_at_idx on public.ig_jobs (status, run_at);

create or replace function public.ig_claim_jobs(p_limit int)
returns setof public.ig_jobs
language sql
volatile
security definer
set search_path = public
as $$
  update public.ig_jobs j
     set status = 'running',
         locked_at = now(),
         attempts = j.attempts + 1
   where j.id in (
     select q.id
       from public.ig_jobs q
      where q.status = 'queued'
        and q.run_at <= now()
      order by q.run_at, q.id
      for update skip locked
      limit greatest(coalesce(p_limit, 0), 0)
   )
  returning j.*;
$$;

-- ============================================================
-- 5. ig_webhook_events (só service_role)
-- ============================================================
create table if not exists public.ig_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text unique,
  event text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ig_webhook_events_created_idx on public.ig_webhook_events (created_at);

-- ============================================================
-- 6. ig_rate (750 respostas privadas por hora; só service_role)
-- ============================================================
create table if not exists public.ig_rate (
  hour timestamptz primary key,
  count int not null default 0
);

create or replace function public.ig_take_slot()
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  insert into public.ig_rate as r (hour, count)
  values (date_trunc('hour', now()), 1)
  on conflict (hour) do update
    set count = r.count + 1
    where r.count < 750
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

create or replace function public.ig_release_slot()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.ig_rate
     set count = greatest(count - 1, 0)
   where hour = date_trunc('hour', now());
$$;

-- ============================================================
-- 7. Links rastreados e cliques
-- ============================================================
create table if not exists public.ig_tracked_links (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.ig_campaigns(id) on delete cascade,
  position int not null check (position in (1, 2)),
  slug text not null unique check (slug ~ '^[0-9A-Za-z]{8,64}$'),
  url text not null check (url ~* '^https?://'),
  constraint ig_tracked_links_campaign_position_key unique (campaign_id, position)
);

create table if not exists public.ig_tracked_link_clicks (
  id bigserial primary key,
  link_id uuid not null references public.ig_tracked_links(id) on delete cascade,
  campaign_id uuid references public.ig_campaigns(id) on delete cascade,
  recipient text check (recipient is null or recipient ~ '^[A-Za-z0-9_-]{22}$'),
  created_at timestamptz not null default now()
);

create index if not exists ig_tracked_link_clicks_link_created_idx
  on public.ig_tracked_link_clicks (link_id, created_at);
create index if not exists ig_tracked_link_clicks_campaign_idx
  on public.ig_tracked_link_clicks (campaign_id);

-- ============================================================
-- 8. ig_follower_history
-- ============================================================
create table if not exists public.ig_follower_history (
  day date primary key,
  followers int not null,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 9. ig_postback_receipts (um toque entrega uma vez; só service_role)
-- ============================================================
create table if not exists public.ig_postback_receipts (
  id text primary key,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 10. RLS
-- ============================================================
alter table public.ig_zernio enable row level security;
alter table public.ig_campaigns enable row level security;
alter table public.ig_dm_logs enable row level security;
alter table public.ig_jobs enable row level security;
alter table public.ig_webhook_events enable row level security;
alter table public.ig_rate enable row level security;
alter table public.ig_tracked_links enable row level security;
alter table public.ig_tracked_link_clicks enable row level security;
alter table public.ig_follower_history enable row level security;
alter table public.ig_postback_receipts enable row level security;

-- ig_zernio, ig_jobs, ig_webhook_events, ig_rate, ig_postback_receipts: sem policies (só service_role).

drop policy if exists "auth_select_ig_campaigns" on public.ig_campaigns;
create policy "auth_select_ig_campaigns" on public.ig_campaigns
  for select using (auth.role() = 'authenticated');
drop policy if exists "auth_insert_ig_campaigns" on public.ig_campaigns;
create policy "auth_insert_ig_campaigns" on public.ig_campaigns
  for insert with check (auth.role() = 'authenticated');
drop policy if exists "auth_update_ig_campaigns" on public.ig_campaigns;
create policy "auth_update_ig_campaigns" on public.ig_campaigns
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "auth_delete_ig_campaigns" on public.ig_campaigns;
create policy "auth_delete_ig_campaigns" on public.ig_campaigns
  for delete using (auth.role() = 'authenticated');

drop policy if exists "auth_select_ig_dm_logs" on public.ig_dm_logs;
create policy "auth_select_ig_dm_logs" on public.ig_dm_logs
  for select using (auth.role() = 'authenticated');

drop policy if exists "auth_select_ig_tracked_links" on public.ig_tracked_links;
create policy "auth_select_ig_tracked_links" on public.ig_tracked_links
  for select using (auth.role() = 'authenticated');

drop policy if exists "auth_select_ig_tracked_link_clicks" on public.ig_tracked_link_clicks;
create policy "auth_select_ig_tracked_link_clicks" on public.ig_tracked_link_clicks
  for select using (auth.role() = 'authenticated');

drop policy if exists "auth_select_ig_follower_history" on public.ig_follower_history;
create policy "auth_select_ig_follower_history" on public.ig_follower_history
  for select using (auth.role() = 'authenticated');

-- ============================================================
-- 11. Relatório público (a edge ig-report chama com a service key)
-- ============================================================
create or replace function public.ig_campaign_report(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.ig_campaigns%rowtype;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_from date := (now() at time zone 'America/Sao_Paulo')::date - 29;
  v_days jsonb;
  v_totals jsonb;
  v_clicks jsonb;
begin
  if p_slug is null or p_slug = '' then
    return null;
  end if;

  select * into c from public.ig_campaigns where share_slug = p_slug;
  if not found then
    return null;
  end if;

  with days as (
    select d::date as day
    from generate_series(v_from, v_today, interval '1 day') d
  ),
  agg as (
    select (l.created_at at time zone 'America/Sao_Paulo')::date as day,
           count(*) filter (where l.status = 'sent')::int as sent,
           count(*) filter (where l.status = 'failed')::int as failed,
           count(*) filter (where l.status in ('skipped_dedup', 'skipped_rate_limit'))::int as skipped
    from public.ig_dm_logs l
    where l.campaign_id = c.id
      and l.created_at >= (v_from::timestamp at time zone 'America/Sao_Paulo')
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'day', to_char(d.day, 'YYYY-MM-DD'),
           'sent', coalesce(a.sent, 0),
           'failed', coalesce(a.failed, 0),
           'skipped', coalesce(a.skipped, 0)
         ) order by d.day), '[]'::jsonb)
    into v_days
    from days d
    left join agg a using (day);

  select jsonb_build_object(
           'sent', count(*) filter (where l.status = 'sent'),
           'failed', count(*) filter (where l.status = 'failed'),
           'skipped', count(*) filter (where l.status in ('skipped_dedup', 'skipped_rate_limit'))
         )
    into v_totals
    from public.ig_dm_logs l
   where l.campaign_id = c.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'position', t.position,
           'label', case t.position
                      when 1 then coalesce(nullif(c.link1_label, ''), 'Abrir link')
                      else coalesce(nullif(c.link2_label, ''), 'Abrir link')
                    end,
           'host', lower(substring(t.url from '^[A-Za-z]+://([^/?#:]+)')),
           'clicks', s.clicks,
           'unique', s.uniq
         ) order by t.position), '[]'::jsonb)
    into v_clicks
    from public.ig_tracked_links t
    cross join lateral (
      select count(k.id)::int as clicks,
             count(distinct k.recipient)::int as uniq
        from public.ig_tracked_link_clicks k
       where k.link_id = t.id
    ) s
   where t.campaign_id = c.id;

  return jsonb_build_object(
    'name', c.name,
    'days', v_days,
    'totals', v_totals,
    'clicks', v_clicks
  );
end;
$$;

-- ============================================================
-- 12. Permissões das funções (só service_role)
-- ============================================================
revoke execute on function public.ig_claim_jobs(int) from public, anon, authenticated;
revoke execute on function public.ig_take_slot() from public, anon, authenticated;
revoke execute on function public.ig_release_slot() from public, anon, authenticated;
revoke execute on function public.ig_campaign_report(text) from public, anon, authenticated;
grant execute on function public.ig_claim_jobs(int) to service_role;
grant execute on function public.ig_take_slot() to service_role;
grant execute on function public.ig_release_slot() to service_role;
grant execute on function public.ig_campaign_report(text) to service_role;

-- ============================================================
-- 13. pg_cron: desliga os crons antigos e agenda o worker de campanhas
-- ============================================================
select cron.unschedule(jobid) from cron.job where jobname = 'instagram-worker-every-minute';
select cron.unschedule(jobid) from cron.job where jobname = 'instagram-token-refresh-daily';
select cron.unschedule(jobid) from cron.job where jobname = 'ig-campaign-worker-every-minute';

select cron.schedule(
  'ig-campaign-worker-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/ig-campaign-worker',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxxcmx2ZWZlem5mYWF1d2d2dWJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NTA4NzEsImV4cCI6MjA4NjUyNjg3MX0.umhDSKFm4yQRox1EkA_eqnHR1_N6pXyX9FstT_qkrfE"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
