-- Bug: both sale-approval push triggers use WHEN (NEW.<status> = 'approved'), which fires on
-- EVERY UPDATE of an already-approved row, not just the transition into 'approved'. A webhook
-- retry (common with payment gateways) or any later edit to an approved sale re-sends the push,
-- producing duplicate "Venda aprovada!" notifications for the same sale.
--
-- Fix: only fire on INSERT (first time we see the row) or on UPDATE where the status actually
-- changed into 'approved' (OLD status was something else).

-- TG_OP isn't available in a WHEN clause, and OLD isn't defined for INSERT — so split
-- the combined INSERT-OR-UPDATE trigger into two triggers instead.

DROP TRIGGER IF EXISTS trigger_send_sale_push ON public.sales;
CREATE TRIGGER trigger_send_sale_push_insert
  AFTER INSERT ON public.sales
  FOR EACH ROW
  WHEN (NEW.sale_status_enum = 'approved')
  EXECUTE FUNCTION public.send_sale_push_notification();
CREATE TRIGGER trigger_send_sale_push_update
  AFTER UPDATE ON public.sales
  FOR EACH ROW
  WHEN (NEW.sale_status_enum = 'approved' AND OLD.sale_status_enum IS DISTINCT FROM NEW.sale_status_enum)
  EXECUTE FUNCTION public.send_sale_push_notification();

DROP TRIGGER IF EXISTS trigger_send_nutra_sale_push ON public.nutra_sales;
CREATE TRIGGER trigger_send_nutra_sale_push_insert
  AFTER INSERT ON public.nutra_sales
  FOR EACH ROW
  WHEN (NEW.status = 'approved')
  EXECUTE FUNCTION public.send_nutra_sale_push_notification();
CREATE TRIGGER trigger_send_nutra_sale_push_update
  AFTER UPDATE ON public.nutra_sales
  FOR EACH ROW
  WHEN (NEW.status = 'approved' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.send_nutra_sale_push_notification();
