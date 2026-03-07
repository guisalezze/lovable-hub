
SELECT cron.schedule(
  'task-reminders-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/task-reminders-cron',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxxcmx2ZWZlem5mYWF1d2d2dWJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NTA4NzEsImV4cCI6MjA4NjUyNjg3MX0.umhDSKFm4yQRox1EkA_eqnHR1_N6pXyX9FstT_qkrfE"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
