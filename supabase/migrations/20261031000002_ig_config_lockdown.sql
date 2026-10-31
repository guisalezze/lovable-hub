-- ig_config guarda o access_token do Instagram. Sem policy, com RLS ligada,
-- so o service_role (edge functions) acessa. O front usa a edge instagram-admin.
drop policy if exists "auth_ig_config" on public.ig_config;
alter table public.ig_config enable row level security;
