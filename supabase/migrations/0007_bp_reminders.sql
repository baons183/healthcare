-- =====================================================================
-- 0007: Giờ nhắc đo huyết áp cho từng thành viên (giờ Việt Nam, VD {07:00,21:00})
-- Chạy trong Supabase > SQL Editor
-- =====================================================================
alter table public.members add column if not exists bp_times text[] not null default '{}';
