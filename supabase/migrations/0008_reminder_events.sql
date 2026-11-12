-- =====================================================================
-- 0008: Theo dõi từng lần nhắc uống thuốc / đo huyết áp
--   - nhắc lại mỗi 15 phút nếu chưa xác nhận (tối đa 3 lần), sau đó báo người nhà
--   - lịch sử đã uống / bỏ lỡ
-- Chạy trong Supabase > SQL Editor
-- =====================================================================
create table if not exists public.reminder_events (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,          -- med:{medication_id}:{yyyy-mm-dd}:{HH:MM} | bp:{member_id}:{date}:{time}
  family_id   uuid not null references public.families(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  kind        text not null check (kind in ('med','bp')),
  ref_id      uuid,                          -- medication_id (với kind = med)
  day         date not null,                 -- ngày theo giờ Việt Nam
  time        text not null,                 -- HH:MM
  status      text not null default 'pending' check (status in ('pending','done','missed')),
  sent_count  int  not null default 0,
  next_at     timestamptz not null default now(),
  done_at     timestamptz,
  done_by     uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists reminder_events_due_idx on public.reminder_events(status, next_at);
create index if not exists reminder_events_member_idx on public.reminder_events(member_id, day);

alter table public.reminder_events enable row level security;
drop policy if exists reminder_events_select on public.reminder_events;
drop policy if exists reminder_events_insert on public.reminder_events;
drop policy if exists reminder_events_update on public.reminder_events;
create policy reminder_events_select on public.reminder_events for select using (public.is_family_member(family_id));
create policy reminder_events_insert on public.reminder_events for insert with check (public.can_edit_family(family_id));
create policy reminder_events_update on public.reminder_events for update
  using (public.can_edit_family(family_id)) with check (public.can_edit_family(family_id));

drop trigger if exists reminder_events_mf on public.reminder_events;
create trigger reminder_events_mf before insert or update on public.reminder_events
  for each row execute function public.check_member_family();
