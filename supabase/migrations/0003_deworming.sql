-- =====================================================================
-- 0003: Lịch xổ giun (tẩy giun)
-- Chạy trong Supabase > SQL Editor
-- =====================================================================
create table if not exists public.dewormings (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  given_on    date not null,
  medicine    text,            -- VD: Albendazole 400mg, Mebendazole 500mg
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists dewormings_member_idx on public.dewormings(member_id, given_on);

alter table public.dewormings enable row level security;

create policy dewormings_select on public.dewormings for select using (public.is_family_member(family_id));
create policy dewormings_insert on public.dewormings for insert with check (public.can_edit_family(family_id));
create policy dewormings_update on public.dewormings for update
  using (public.can_edit_family(family_id)) with check (public.can_edit_family(family_id));
create policy dewormings_delete on public.dewormings for delete using (public.can_edit_family(family_id));

create trigger dewormings_mf before insert or update on public.dewormings
  for each row execute function public.check_member_family();
