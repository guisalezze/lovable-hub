
-- Remove o cron antigo (horário) e cria o novo (diário às 08:00 BRT)
SELECT cron.unschedule('task-reminders-hourly');

SELECT cron.schedule(
  'task-reminders-daily-0800',
  '0 11 * * *',
  $$
  SELECT net.http_post(
    url := 'https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/task-reminders-cron',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxxcmx2ZWZlem5mYWF1d2d2dWJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NTA4NzEsImV4cCI6MjA4NjUyNjg3MX0.umhDSKFm4yQRox1EkA_eqnHR1_N6pXyX9FstT_qkrfE"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);
