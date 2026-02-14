
-- Store Meta Ads config in app_settings
INSERT INTO public.app_settings (key, value)
VALUES 
  ('meta_ads_account_id', '""'::jsonb),
  ('meta_ads_access_token', '""'::jsonb),
  ('meta_ads_last_sync', 'null'::jsonb)
ON CONFLICT (key) DO NOTHING;
