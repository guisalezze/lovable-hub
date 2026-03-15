-- Função para enviar notificação push quando uma venda é aprovada
CREATE OR REPLACE FUNCTION public.send_sale_push_notification()
RETURNS TRIGGER AS $$
DECLARE
  sale_amount NUMERIC;
  product_name TEXT;
  user_id_to_notify UUID;
BEGIN
  -- Verificar se a venda foi aprovada
  IF NEW.sale_status_enum = 'approved' THEN
    sale_amount := NEW.sale_amount;
    product_name := NEW.product_name;
    
    -- Buscar todos os usuários que têm push ativado
    -- Por enquanto, notificar apenas o usuário que criou a venda (ou todos os admins)
    -- Você pode ajustar a lógica conforme necessário
    
    -- Notificar todos os usuários com push ativado
    FOR user_id_to_notify IN
      SELECT DISTINCT ps.user_id
      FROM public.push_subscriptions ps
    LOOP
      -- Chamar Edge Function para enviar push
      PERFORM
        net.http_post(
          url := current_setting('app.supabase_url') || '/functions/v1/send-push-notification',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key')
          ),
          body := jsonb_build_object(
            'userId', user_id_to_notify,
            'title', 'Venda aprovada! 🎉',
            'body', 'Valor: R$ ' || TO_CHAR(sale_amount, 'FM999G999G999D90') || 
                    CASE WHEN product_name IS NOT NULL THEN ' - ' || product_name ELSE '' END,
            'icon', '/logo.png',
            'tag', 'sale-' || NEW.id::text,
            'data', jsonb_build_object(
              'url', '/financeiro',
              'type', 'sale',
              'saleId', NEW.id
            )
          )
        );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para sales (Educacional)
DROP TRIGGER IF EXISTS trigger_send_sale_push ON public.sales;
CREATE TRIGGER trigger_send_sale_push
  AFTER INSERT OR UPDATE ON public.sales
  FOR EACH ROW
  WHEN (NEW.sale_status_enum = 'approved')
  EXECUTE FUNCTION public.send_sale_push_notification();

-- Trigger para nutra_sales
DROP TRIGGER IF EXISTS trigger_send_nutra_sale_push ON public.nutra_sales;
CREATE TRIGGER trigger_send_nutra_sale_push
  AFTER INSERT OR UPDATE ON public.nutra_sales
  FOR EACH ROW
  WHEN (NEW.status = 'approved')
  EXECUTE FUNCTION public.send_sale_push_notification();
