-- =====================================================================
-- 0009: Giờ nhận nhắc lịch hằng ngày của từng người (giờ Việt Nam, HH:MM)
-- Chạy trong Supabase > SQL Editor
-- =====================================================================
alter table public.notification_settings add column if not exists daily_time text not null default '06:30'
  check (daily_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
