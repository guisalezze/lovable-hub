-- Username aliases: maps short usernames to emails, server-side only.
-- RLS enabled with no SELECT policy for anon/authenticated — only service role (edge function) can read.
create table if not exists username_aliases (
  username text primary key,
  email    text not null
);

alter table username_aliases enable row level security;

-- Seed current aliases
insert into username_aliases (username, email) values
  ('guizz',   'salezzeguilherme@gmail.com'),
  ('marilia', 'mariliacatarinne@gmail.com'),
  ('kabul',   'marcusv.castello@gmail.com')
on conflict (username) do nothing;
