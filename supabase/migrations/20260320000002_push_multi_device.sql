-- Remover constraint UNIQUE em user_id para suportar múltiplos dispositivos
-- O endpoint permanece UNIQUE (garante que o mesmo dispositivo não se registra duas vezes)
ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_key;
