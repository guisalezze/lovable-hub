-- Bug: send_nutra_sale_push_notification() calls extensions.http_post(), which does not
-- exist in this database — pg_net is installed in the `net` schema (confirmed via
-- pg_proc/pg_namespace), not `extensions`. Every nutra_sales approval trigger has been
-- throwing `42883: function extensions.http_post(...) does not exist` since the
-- 20260320000001_fix_push_notifications.sql migration, silently rolling back the approval
-- write (cartpanda-s2s does not check the Supabase client's .error before responding 200).
--
-- Fix: point it at net.http_post(), matching the working send_sale_push_notification().

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
    PERFORM net.http_post(
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
