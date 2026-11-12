-- =====================================================================
-- 0002: Hỗ trợ đăng nhập bằng số điện thoại
-- - Lời mời có thể theo email HOẶC số điện thoại
-- - Trigger/hàm nhận lời mời so khớp cả số điện thoại
-- Chạy trong Supabase > SQL Editor sau 0001_init.sql
-- =====================================================================

-- Chuẩn hóa SĐT về dạng chỉ chữ số, mã quốc gia 84 (0912... -> 84912...)
create or replace function public.normalize_phone(p text)
returns text language sql immutable as $$
  select case
    when p is null or p = '' then null
    when regexp_replace(p, '\D', '', 'g') like '0%'
      then '84' || substr(regexp_replace(p, '\D', '', 'g'), 2)
    else regexp_replace(p, '\D', '', 'g')
  end;
$$;

alter table public.family_invites alter column email drop not null;
alter table public.family_invites add column if not exists phone text;
alter table public.family_invites drop constraint if exists family_invites_contact_check;
alter table public.family_invites add constraint family_invites_contact_check
  check (email is not null or phone is not null);
create unique index if not exists family_invites_phone_uniq on public.family_invites (family_id, phone);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  fid uuid;
  invited int;
  ph text := public.normalize_phone(new.phone);
begin
  insert into family_users (family_id, user_id, role)
    select family_id, new.id, role from family_invites
    where (new.email is not null and lower(email) = lower(new.email))
       or (ph is not null and phone = ph)
    on conflict do nothing;
  get diagnostics invited = row_count;
  delete from family_invites
    where (new.email is not null and lower(email) = lower(new.email))
       or (ph is not null and phone = ph);

  if invited = 0 then
    insert into families (name, owner_id)
      values ('Gia đình của ' || coalesce(split_part(new.email, '@', 1), '0' || substr(ph, 3), 'tôi'), new.id)
      returning id into fid;
    insert into family_users (family_id, user_id, role) values (fid, new.id, 'owner');
  end if;
  return new;
end $$;

create or replace function public.accept_pending_invites()
returns int language plpgsql security definer set search_path = public as $$
declare
  n int;
  em text;
  ph text;
begin
  select email, public.normalize_phone(phone) into em, ph from auth.users where id = auth.uid();
  insert into family_users (family_id, user_id, role)
    select family_id, auth.uid(), role from family_invites
    where (em is not null and lower(email) = lower(em)) or (ph is not null and phone = ph)
    on conflict do nothing;
  get diagnostics n = row_count;
  delete from family_invites
    where (em is not null and lower(email) = lower(em)) or (ph is not null and phone = ph);
  return n;
end $$;

-- Hiển thị email hoặc SĐT của người dùng trong gia đình
create or replace function public.family_user_list(fid uuid)
returns table (user_id uuid, email text, role text)
language sql stable security definer set search_path = public as $$
  select fu.user_id,
         coalesce(u.email::text, case when u.phone is not null and u.phone <> '' then '+' || u.phone end),
         fu.role
  from family_users fu join auth.users u on u.id = fu.user_id
  where fu.family_id = fid and public.is_family_member(fid);
$$;
