-- =====================================================================
-- 0004: Thông báo đẩy (Web Push)
-- Chạy trong Supabase > SQL Editor
-- =====================================================================

-- Thiết bị đã đăng ký nhận thông báo (mỗi trình duyệt/điện thoại 1 dòng)
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

-- Cài đặt thông báo của từng người dùng
create table if not exists public.notification_settings (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  notify_measure  boolean not null default true,   -- nhắc cân đo hàng tháng
  notify_vaccine  boolean not null default true,   -- mũi tiêm / xổ giun sắp tới (15 ngày)
  notify_overdue  boolean not null default true,   -- ngày 1 hàng tháng: tổng hợp mũi quá hạn
  updated_at      timestamptz not null default now()
);

-- Nhật ký đã gửi – tránh gửi trùng (chỉ server ghi bằng service role)
create table if not exists public.notification_log (
  user_id   uuid not null references auth.users(id) on delete cascade,
  key       text not null,
  sent_at   timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.push_subscriptions    enable row level security;
alter table public.notification_settings enable row level security;
alter table public.notification_log      enable row level security;

create policy push_own on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy settings_own on public.notification_settings for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- notification_log: không có policy -> chỉ service role (server) đọc/ghi
