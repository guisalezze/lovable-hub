-- =============================================================================
-- BLOCO 1: Corrigir Push Notifications
-- =============================================================================

-- 1. Habilitar pg_net (necessário para net.http_post no trigger)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Corrigir a função de push para sales (Educacional)
--    Usa NEW.sale_amount e NEW.product_name (colunas corretas da tabela sales)
CREATE OR REPLACE FUNCTION public.send_sale_push_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_supabase_url TEXT;
  v_service_key TEXT;
BEGIN
  v_supabase_url := current_setting('app.supabase_url', true);
  v_service_key  := current_setting('app.supabase_service_key', true);

  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN
    RAISE LOG '[push_trigger] app.supabase_url ou app.supabase_service_key não configurados — pulando push';
    RETURN NEW;
  END IF;

  FOR v_user_id IN
    SELECT ps.user_id FROM public.push_subscriptions ps
  LOOP
    PERFORM extensions.http_post(
      url     := v_supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body    := jsonb_build_object(
        'userId', v_user_id,
        'title',  'Venda aprovada! 🎉',
        'body',   'Valor: R$ ' || TO_CHAR(NEW.sale_amount, 'FM999G999D90') ||
                  CASE WHEN NEW.product_name IS NOT NULL THEN ' – ' || NEW.product_name ELSE '' END,
        'icon',   '/logo.png',
        'tag',    'sale-' || NEW.id::text,
        'data',   jsonb_build_object('url', '/financeiro', 'type', 'sale', 'saleId', NEW.id)
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Função separada para nutra_sales
--    Usa NEW.amount (correto) em vez de NEW.sale_amount
CREATE OR REPLACE FUNCTION public.send_nutra_sale_push_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_supabase_url TEXT;
  v_service_key TEXT;
BEGIN
  v_supabase_url := current_setting('app.supabase_url', true);
  v_service_key  := current_setting('app.supabase_service_key', true);

  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN
    RAISE LOG '[push_trigger_nutra] app.supabase_url ou app.supabase_service_key não configurados — pulando push';
    RETURN NEW;
  END IF;

  FOR v_user_id IN
    SELECT ps.user_id FROM public.push_subscriptions ps
  LOOP
    PERFORM extensions.http_post(
      url     := v_supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body    := jsonb_build_object(
        'userId', v_user_id,
        'title',  'Venda aprovada! 🎉',
        'body',   'Valor: R$ ' || TO_CHAR(NEW.amount, 'FM999G999D90') ||
                  CASE WHEN NEW.product_name IS NOT NULL THEN ' – ' || NEW.product_name ELSE '' END,
        'icon',   '/logo.png',
        'tag',    'sale-' || NEW.id::text,
        'data',   jsonb_build_object('url', '/financeiro', 'type', 'sale', 'saleId', NEW.id)
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Recriar triggers com as funções corretas
DROP TRIGGER IF EXISTS trigger_send_sale_push ON public.sales;
CREATE TRIGGER trigger_send_sale_push
  AFTER INSERT OR UPDATE ON public.sales
  FOR EACH ROW
  WHEN (NEW.sale_status_enum = 'approved')
  EXECUTE FUNCTION public.send_sale_push_notification();

DROP TRIGGER IF EXISTS trigger_send_nutra_sale_push ON public.nutra_sales;
CREATE TRIGGER trigger_send_nutra_sale_push
  AFTER INSERT OR UPDATE ON public.nutra_sales
  FOR EACH ROW
  WHEN (NEW.status = 'approved')
  EXECUTE FUNCTION public.send_nutra_sale_push_notification();

-- =============================================================================
-- AÇÃO MANUAL NECESSÁRIA (rodar no SQL Editor do Supabase após o deploy):
--
--   ALTER DATABASE postgres
--     SET app.supabase_url = 'https://lqrlvefeznfaauwgvubl.supabase.co';
--
--   ALTER DATABASE postgres
--     SET app.supabase_service_key = '<SERVICE_ROLE_KEY>';
--
--   SELECT pg_reload_conf();
--
-- O SERVICE_ROLE_KEY está em: Supabase Dashboard > Settings > API > service_role (secret)
-- =============================================================================
