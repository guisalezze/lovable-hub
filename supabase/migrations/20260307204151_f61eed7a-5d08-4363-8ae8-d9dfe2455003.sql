
-- Create task_whatsapp_notifications table
CREATE TABLE public.task_whatsapp_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  recipient_user_id UUID NOT NULL,
  recipient_phone TEXT NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN ('assignment', 'reminder')),
  whatsapp_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'delivered', 'read')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX idx_task_wa_notif_task ON public.task_whatsapp_notifications(task_id);
CREATE INDEX idx_task_wa_notif_recipient ON public.task_whatsapp_notifications(recipient_user_id);
CREATE INDEX idx_task_wa_notif_created ON public.task_whatsapp_notifications(created_at);

-- Enable RLS
ALTER TABLE public.task_whatsapp_notifications ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage task_whatsapp_notifications"
  ON public.task_whatsapp_notifications
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Users can read their own notifications
CREATE POLICY "Users can read own whatsapp notifications"
  ON public.task_whatsapp_notifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = recipient_user_id);
