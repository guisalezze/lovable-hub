-- Suportar múltiplos dispositivos por usuário:
-- 1. Remove a constraint UNIQUE em user_id
-- 2. Garante constraint nomeada em endpoint (necessária para upsert via PostgREST)

ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_key;

ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_endpoint_key;

ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);
