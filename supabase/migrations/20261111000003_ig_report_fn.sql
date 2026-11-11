-- Agregações do relatório público (edge ig-report): o banco soma, a edge só formata.
-- Só service_role executa (a edge usa a service key).

create or replace function public.ig_report_daily(p_rule uuid, p_days int default 30)
returns table (day date, sent int, failed int, skipped int)
language sql
stable
security definer
set search_path = public
as $$
  with days as (
    select d::date as day
    from generate_series(
      (now() at time zone 'America/Sao_Paulo')::date - (greatest(p_days, 1) - 1),
      (now() at time zone 'America/Sao_Paulo')::date,
      interval '1 day'
    ) d
  ),
  agg as (
    select (r.created_at at time zone 'America/Sao_Paulo')::date as day,
           count(*) filter (where r.status = 'sent')::int as sent,
           count(*) filter (where r.status = 'failed')::int as failed,
           count(*) filter (where r.status = 'skipped')::int as skipped
    from public.ig_replies r
    where r.rule_id = p_rule
      and r.kind <> 'postback'
      and r.created_at >= ((now() at time zone 'America/Sao_Paulo')::date - (greatest(p_days, 1) - 1))::timestamp at time zone 'America/Sao_Paulo'
    group by 1
  )
  select d.day, coalesce(a.sent, 0), coalesce(a.failed, 0), coalesce(a.skipped, 0)
  from days d left join agg a using (day)
  order by d.day;
$$;

create or replace function public.ig_report_clicks(p_rule uuid)
returns table (node_id text, button_index int, url text, clicks int)
language sql
stable
security definer
set search_path = public
as $$
  select l.node_id, l.button_index, l.url, count(c.id)::int
  from public.ig_links l
  left join public.ig_link_clicks c on c.link_id = l.id
  where l.rule_id = p_rule
  group by l.id, l.node_id, l.button_index, l.url;
$$;

revoke execute on function public.ig_report_daily(uuid, int) from public, anon, authenticated;
revoke execute on function public.ig_report_clicks(uuid) from public, anon, authenticated;
grant execute on function public.ig_report_daily(uuid, int) to service_role;
grant execute on function public.ig_report_clicks(uuid) to service_role;
