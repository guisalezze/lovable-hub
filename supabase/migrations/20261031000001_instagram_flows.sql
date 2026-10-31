-- Instagram Fluxos Visuais: modelo v2 (regra = ig_automations + flow jsonb)

-- ============================================================
-- 1. ig_automations: novas colunas
-- ============================================================
alter table public.ig_automations add column if not exists flow jsonb;
alter table public.ig_automations add column if not exists trigger text not null default 'comment';
alter table public.ig_automations add column if not exists position int not null default 0;
alter table public.ig_automations add column if not exists media_label text;

alter table public.ig_automations drop constraint if exists ig_automations_trigger_check;
alter table public.ig_automations
  add constraint ig_automations_trigger_check
  check (trigger in ('comment', 'dm', 'story', 'mention'));

-- ============================================================
-- 2. ig_contacts: novas colunas
-- ============================================================
alter table public.ig_contacts add column if not exists name text;
alter table public.ig_contacts add column if not exists tags text[] not null default '{}';
alter table public.ig_contacts add column if not exists last_in_at timestamptz;
alter table public.ig_contacts add column if not exists profile_pic text;
alter table public.ig_contacts add column if not exists profile_fetched_at timestamptz;

create index if not exists ig_contacts_tags_gin on public.ig_contacts using gin (tags);

-- ============================================================
-- 3. ig_replies (log; ref unico = idempotencia contra reenvio da Meta)
-- ============================================================
create table if not exists public.ig_replies (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  rule_id uuid references public.ig_automations(id) on delete set null,
  kind text not null,
  ig_user_id text,
  username text,
  text_in text,
  status text not null default 'pending',
  error text,
  created_at timestamptz not null default now()
);

create index if not exists ig_replies_created_at_idx on public.ig_replies (created_at desc);
create index if not exists ig_replies_user_rule_idx on public.ig_replies (ig_user_id, rule_id, created_at desc);

-- ============================================================
-- 4. ig_flow_runs (esperas do fluxo)
-- ============================================================
create table if not exists public.ig_flow_runs (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid references public.ig_automations(id) on delete cascade,
  ig_user_id text not null,
  node_id text not null,
  resume_at timestamptz not null,
  status text not null default 'waiting',
  error text,
  created_at timestamptz not null default now()
);

create index if not exists ig_flow_runs_status_resume_idx on public.ig_flow_runs (status, resume_at);

-- ============================================================
-- 5. RLS
-- ============================================================
alter table public.ig_replies enable row level security;
alter table public.ig_flow_runs enable row level security;

drop policy if exists "auth_ig_replies" on public.ig_replies;
create policy "auth_ig_replies" on public.ig_replies for all using (auth.role() = 'authenticated');

drop policy if exists "auth_ig_flow_runs" on public.ig_flow_runs;
create policy "auth_ig_flow_runs" on public.ig_flow_runs for all using (auth.role() = 'authenticated');

-- ============================================================
-- 6. Backfill: converte automacoes v1 em fluxo equivalente
--    start -> m1 (welcome_dm + botao "continua") -> m2 (link_text + botao URL)
--          -> [d1 espera -> m3 (reminder_text)]
--    Nos com texto vazio sao omitidos e o encadeamento pula para o proximo.
-- ============================================================
do $backfill$
declare
  r record;
  has_welcome boolean;
  has_link boolean;
  has_rem boolean;
  after_m1 text;
  after_m2 text;
  start_next text;
  nodes jsonb;
  m2_buttons jsonb;
  new_triggers text[];
  tg text;
  tg2 text;
  kws text[];
  new_match text;
  new_active boolean;
  i int;
begin
  for r in select * from public.ig_automations where flow is null loop
    has_welcome := nullif(btrim(coalesce(r.welcome_dm, '')), '') is not null;
    has_link := nullif(btrim(coalesce(r.link_text, '')), '') is not null
             or nullif(btrim(coalesce(r.link_url, '')), '') is not null;
    has_rem := nullif(btrim(coalesce(r.reminder_text, '')), '') is not null;

    after_m2 := case when has_rem then 'd1' else null end;
    after_m1 := case when has_link then 'm2' when has_rem then 'd1' else null end;
    start_next := case
      when has_welcome then 'm1'
      when has_link then 'm2'
      when has_rem then 'd1'
      else null
    end;

    nodes := jsonb_build_object(
      'start', jsonb_build_object('id', 'start', 'type', 'start', 'x', 0, 'y', 0, 'next', start_next)
    );

    if has_welcome then
      nodes := nodes || jsonb_build_object('m1', jsonb_build_object(
        'id', 'm1', 'type', 'message', 'x', 380, 'y', 0,
        'text', r.welcome_dm,
        'buttons', case
          when after_m1 is not null then jsonb_build_array(jsonb_build_object(
            'label', coalesce(nullif(btrim(r.quick_reply_label), ''), 'Quero!'),
            'type', 'flow',
            'next', after_m1))
          else '[]'::jsonb
        end
      ));
    end if;

    if has_link then
      m2_buttons := case
        when nullif(btrim(coalesce(r.link_url, '')), '') is not null then jsonb_build_array(jsonb_build_object(
          'label', coalesce(nullif(btrim(r.link_button_label), ''), 'Acessar'),
          'type', 'url',
          'url', r.link_url))
        else '[]'::jsonb
      end;
      nodes := nodes || jsonb_build_object('m2', jsonb_build_object(
        'id', 'm2', 'type', 'message', 'x', 760, 'y', 0,
        'text', coalesce(nullif(btrim(r.link_text), ''), coalesce(nullif(btrim(r.link_button_label), ''), 'Acessar')),
        'buttons', m2_buttons,
        'next', after_m2
      ));
    end if;

    if has_rem then
      nodes := nodes || jsonb_build_object(
        'd1', jsonb_build_object(
          'id', 'd1', 'type', 'delay', 'x', 1140, 'y', 0,
          'amount', coalesce(r.reminder_delay_minutes, 60), 'unit', 'min', 'next', 'm3'),
        'm3', jsonb_build_object(
          'id', 'm3', 'type', 'message', 'x', 1520, 'y', 0,
          'text', r.reminder_text, 'buttons', '[]'::jsonb)
      );
    end if;

    -- gatilhos v1: comment | story_reply | dm  ->  v2: comment | story | dm
    new_triggers := '{}';
    foreach tg in array coalesce(r.triggers, '{}') loop
      if tg = 'story_reply' then tg2 := 'story'; else tg2 := tg; end if;
      if tg2 in ('comment', 'dm', 'story', 'mention') and not (tg2 = any(new_triggers)) then
        new_triggers := new_triggers || tg2;
      end if;
    end loop;
    if coalesce(array_length(new_triggers, 1), 0) = 0 then
      new_triggers := array['comment'];
    end if;

    -- palavras-chave v1: 'any' = sempre; 'exact'/outros = lista (lista vazia nunca casava)
    --   v2: lista vazia = qualquer texto, entao 'any' vira '{}' e v1-vazio-sem-any fica inativo
    select coalesce(array_agg(btrim(k)) filter (where btrim(k) <> ''), '{}')
      into kws
      from unnest(coalesce(r.keywords, '{}')) as k;
    if r.match_type = 'any' then
      kws := '{}';
      new_match := 'contains';
    else
      new_match := case when r.match_type = 'exact' then 'exact' else 'contains' end; -- v1 tratava qualquer outro valor como contains
    end if;
    new_active := coalesce(r.active, false)
                  and (r.match_type = 'any' or coalesce(array_length(kws, 1), 0) > 0);

    update public.ig_automations
       set flow = jsonb_build_object('nodes', nodes),
           trigger = new_triggers[1],
           keywords = kws,
           match_type = new_match,
           active = new_active
     where id = r.id;

    -- um gatilho extra vira uma copia da regra (mesmo fluxo, novo id)
    for i in 2 .. coalesce(array_length(new_triggers, 1), 0) loop
      insert into public.ig_automations (
        name, active, triggers, keywords, match_type, post_id, public_replies,
        welcome_dm, quick_reply_label, link_text, link_button_label, link_url,
        reminder_text, reminder_delay_minutes, flow, trigger, position, media_label
      )
      select r.name || ' (' || new_triggers[i] || ')', new_active, r.triggers, kws, new_match,
             r.post_id, r.public_replies, r.welcome_dm, r.quick_reply_label, r.link_text,
             r.link_button_label, r.link_url, r.reminder_text, r.reminder_delay_minutes,
             jsonb_build_object('nodes', nodes), new_triggers[i], r.position, r.media_label;
    end loop;
  end loop;
end
$backfill$;

-- ============================================================
-- 7. pg_cron (mesmo padrao de 20260911000004_meta_sync_cron.sql)
-- ============================================================
select cron.unschedule(jobid) from cron.job where jobname = 'instagram-worker-every-minute';

select cron.schedule(
  'instagram-worker-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/instagram-worker',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxxcmx2ZWZlem5mYWF1d2d2dWJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NTA4NzEsImV4cCI6MjA4NjUyNjg3MX0.umhDSKFm4yQRox1EkA_eqnHR1_N6pXyX9FstT_qkrfE"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);

select cron.unschedule(jobid) from cron.job where jobname = 'instagram-token-refresh-daily';

select cron.schedule(
  'instagram-token-refresh-daily',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/instagram-token-refresh',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxxcmx2ZWZlem5mYWF1d2d2dWJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NTA4NzEsImV4cCI6MjA4NjUyNjg3MX0.umhDSKFm4yQRox1EkA_eqnHR1_N6pXyX9FstT_qkrfE"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
