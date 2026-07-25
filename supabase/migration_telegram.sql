-- Optional: default telegram settings
INSERT INTO public.app_settings (key, value) VALUES ('telegram', '{"enabled": false, "bot_token": "", "chat_id": "", "notify_restock": true, "notify_debt_due": true, "notify_daily_summary": false}'::jsonb) ON CONFLICT (key) DO NOTHING;
