-- =============================================================================
-- BLOCO 1: Corrigir Push Notifications
-- =============================================================================

-- 1. Habilitar pg_net (necessário para net.http_post no trigger)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Função de push para sales (Educacional) — usa NEW.sale_amount
CREATE OR REPLACE FUNCTION public.send_sale_push_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  -- A anon key é pública por design (está no frontend). Usamos ela apenas para
  -- autenticar a chamada à edge function, que usa o service_role internamente.
  v_supabase_url CONSTANT TEXT := 'https://lqrlvefeznfaauwgvubl.supabase.co';
  v_anon_key     CONSTANT TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxxcmx2ZWZlem5mYWF1d2d2dWJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NTA4NzEsImV4cCI6MjA4NjUyNjg3MX0.umhDSKFm4yQRox1EkA_eqnHR1_N6pXyX9FstT_qkrfE';
BEGIN
  FOR v_user_id IN
    SELECT ps.user_id FROM public.push_subscriptions ps
  LOOP
    PERFORM extensions.http_post(
      url     := v_supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_anon_key
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

-- 3. Função separada para nutra_sales — usa NEW.amount (coluna correta)
CREATE OR REPLACE FUNCTION public.send_nutra_sale_push_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_supabase_url CONSTANT TEXT := 'https://lqrlvefeznfaauwgvubl.supabase.co';
  v_anon_key     CONSTANT TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxxcmx2ZWZlem5mYWF1d2d2dWJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NTA4NzEsImV4cCI6MjA4NjUyNjg3MX0.umhDSKFm4yQRox1EkA_eqnHR1_N6pXyX9FstT_qkrfE';
BEGIN
  FOR v_user_id IN
    SELECT ps.user_id FROM public.push_subscriptions ps
  LOOP
    PERFORM extensions.http_post(
      url     := v_supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_anon_key
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
