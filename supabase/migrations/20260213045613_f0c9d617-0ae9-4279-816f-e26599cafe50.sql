
-- Completed_at trigger
CREATE OR REPLACE FUNCTION public.set_task_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'concluido' AND (OLD IS NULL OR OLD.status != 'concluido') THEN
    NEW.completed_at = now();
  ELSIF NEW.status != 'concluido' AND OLD IS NOT NULL AND OLD.status = 'concluido' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER set_task_completed_at_trigger
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_task_completed_at();

-- Auto notification + pending webhook on task assignment
CREATE OR REPLACE FUNCTION public.on_task_assigned()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND (OLD IS NULL OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN
    INSERT INTO public.notifications (user_id, type, task_id, message)
    VALUES (NEW.assigned_to, 'TASK_ASSIGNED', NEW.id, 'Tarefa atribuída: ' || NEW.title);
    INSERT INTO public.pending_webhooks (user_id, task_id, event_type, payload)
    VALUES (NEW.assigned_to, NEW.id, 'TASK_ASSIGNED', jsonb_build_object(
      'event', 'TASK_ASSIGNED',
      'task', jsonb_build_object('id', NEW.id, 'title', NEW.title, 'priority', NEW.priority, 'status', NEW.status, 'due_date', NEW.due_date)
    ));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_task_assigned_trigger
  AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.on_task_assigned();
