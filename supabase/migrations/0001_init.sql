-- =====================================================================
-- HealthCare – schema khởi tạo
-- Chạy trong Supabase Dashboard > SQL Editor (dán toàn bộ file và Run)
-- Mô hình đa người dùng (multi-tenant): mỗi "family" là 1 tenant.
-- Mọi bảng dữ liệu đều có family_id + Row Level Security.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- Gia đình (tenant) ----------
create table public.families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  plan        text not null default 'free',          -- dành cho thương mại hóa: free | pro | clinic...
  created_at  timestamptz not null default now()
);

create table public.family_users (
  family_id   uuid not null references public.families(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'editor' check (role in ('owner','editor','viewer')),
  created_at  timestamptz not null default now(),
  primary key (family_id, user_id)
);

create table public.family_invites (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  email       text not null,
  role        text not null default 'editor' check (role in ('editor','viewer')),
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (family_id, email)
);

-- ---------- Thành viên được theo dõi ----------
create table public.members (
  id                  uuid primary key default gen_random_uuid(),
  family_id           uuid not null references public.families(id) on delete cascade,
  full_name           text not null,
  gender              text not null check (gender in ('male','female')),
  birth_date          date not null,
  blood_type          text,
  allergies           text,
  chronic_conditions  text,
  notes               text,
  color               text default '#2a78d6',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on public.members(family_id);

-- ---------- Số đo ----------
create table public.measurements (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families(id) on delete cascade,
  member_id    uuid not null references public.members(id) on delete cascade,
  measured_on  date not null,
  height_cm    numeric(5,1) check (height_cm is null or (height_cm > 20 and height_cm < 260)),
  weight_kg    numeric(5,2) check (weight_kg is null or (weight_kg > 0.3 and weight_kg < 400)),
  head_cm      numeric(4,1) check (head_cm   is null or (head_cm > 20 and head_cm < 70)),
  notes        text,
  created_at   timestamptz not null default now()
);
create index on public.measurements(member_id, measured_on);

-- ---------- Bệnh sử ----------
create table public.illnesses (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families(id) on delete cascade,
  member_id    uuid not null references public.members(id) on delete cascade,
  name         text not null,                   -- tên bệnh / lý do khám
  started_on   date not null,
  ended_on     date,
  severity     text default 'mild' check (severity in ('mild','moderate','severe')),
  symptoms     text,
  diagnosis    text,
  treatment    text,                            -- thuốc / điều trị
  facility     text,                            -- nơi khám
  doctor       text,
  notes        text,
  created_at   timestamptz not null default now()
);
create index on public.illnesses(member_id, started_on);

-- ---------- Tiêm chủng ----------
create table public.vaccinations (
  id               uuid primary key default gen_random_uuid(),
  family_id        uuid not null references public.families(id) on delete cascade,
  member_id        uuid not null references public.members(id) on delete cascade,
  vaccine_code     text,                        -- mã trong danh mục (src/lib/vaccines.ts), null = khác
  vaccine_name     text not null,               -- tên thương mại, VD: Hexaxim, Infanrix Hexa
  dose_number      int,
  administered_on  date not null,
  facility         text,
  lot_number       text,
  next_due_on      date,
  notes            text,
  created_at       timestamptz not null default now()
);
create index on public.vaccinations(member_id, administered_on);

-- ---------- Tài liệu đính kèm (ảnh giấy tiêm, đơn thuốc, kết quả xét nghiệm…) ----------
create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  ref_type      text not null default 'general' check (ref_type in ('general','vaccination','illness','measurement')),
  ref_id        uuid,
  storage_path  text not null,
  file_name     text,
  mime_type     text,
  size_bytes    int,
  created_at    timestamptz not null default now()
);
create index on public.documents(member_id, ref_type, ref_id);

-- =====================================================================
-- Hàm hỗ trợ phân quyền
-- =====================================================================
create or replace function public.is_family_member(fid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from family_users where family_id = fid and user_id = auth.uid());
$$;

create or replace function public.can_edit_family(fid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from family_users
                 where family_id = fid and user_id = auth.uid() and role in ('owner','editor'));
$$;

create or replace function public.is_family_owner(fid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from family_users
                 where family_id = fid and user_id = auth.uid() and role = 'owner');
$$;

-- Tự tạo gia đình cho người dùng mới + nhận lời mời theo email
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  fid uuid;
  invited int;
begin
  insert into family_users (family_id, user_id, role)
    select family_id, new.id, role from family_invites where lower(email) = lower(new.email)
    on conflict do nothing;
  get diagnostics invited = row_count;
  delete from family_invites where lower(email) = lower(new.email);

  if invited = 0 then
    insert into families (name, owner_id)
      values ('Gia đình của ' || coalesce(split_part(new.email, '@', 1), 'tôi'), new.id)
      returning id into fid;
    insert into family_users (family_id, user_id, role) values (fid, new.id, 'owner');
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Người dùng đã có tài khoản: nhận lời mời khi đăng nhập (gọi từ app)
create or replace function public.accept_pending_invites()
returns int language plpgsql security definer set search_path = public as $$
declare
  n int;
  em text := (select email from auth.users where id = auth.uid());
begin
  insert into family_users (family_id, user_id, role)
    select family_id, auth.uid(), role from family_invites where lower(email) = lower(em)
    on conflict do nothing;
  get diagnostics n = row_count;
  delete from family_invites where lower(email) = lower(em);
  return n;
end $$;

-- Tạo gia đình mới (khi người dùng chưa có gia đình nào)
create or replace function public.create_family(fname text)
returns uuid language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into families (name, owner_id) values (fname, auth.uid()) returning id into fid;
  insert into family_users (family_id, user_id, role) values (fid, auth.uid(), 'owner');
  return fid;
end $$;

-- Danh sách người dùng của gia đình kèm email (chỉ thành viên mới xem được)
create or replace function public.family_user_list(fid uuid)
returns table (user_id uuid, email text, role text)
language sql stable security definer set search_path = public as $$
  select fu.user_id, u.email::text, fu.role
  from family_users fu join auth.users u on u.id = fu.user_id
  where fu.family_id = fid and public.is_family_member(fid);
$$;

-- updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger members_touch before update on public.members
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.families       enable row level security;
alter table public.family_users   enable row level security;
alter table public.family_invites enable row level security;
alter table public.members        enable row level security;
alter table public.measurements   enable row level security;
alter table public.illnesses      enable row level security;
alter table public.vaccinations   enable row level security;
alter table public.documents      enable row level security;

create policy families_select on public.families for select using (public.is_family_member(id));
create policy families_update on public.families for update using (public.is_family_owner(id));
create policy families_delete on public.families for delete using (public.is_family_owner(id));

create policy fu_select on public.family_users for select using (public.is_family_member(family_id));
create policy fu_update on public.family_users for update using (public.is_family_owner(family_id));
create policy fu_delete on public.family_users for delete
  using (public.is_family_owner(family_id) or user_id = auth.uid());

create policy inv_all on public.family_invites for all
  using (public.is_family_owner(family_id)) with check (public.is_family_owner(family_id));

-- Bảng dữ liệu: thành viên xem, owner/editor sửa
do $$
declare t text;
begin
  foreach t in array array['members','measurements','illnesses','vaccinations','documents'] loop
    execute format('create policy %1$s_select on public.%1$s for select using (public.is_family_member(family_id))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert with check (public.can_edit_family(family_id))', t);
    execute format('create policy %1$s_update on public.%1$s for update using (public.can_edit_family(family_id)) with check (public.can_edit_family(family_id))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete using (public.can_edit_family(family_id))', t);
  end loop;
end $$;

-- Đảm bảo member_id thuộc đúng family_id (chống ghi chéo tenant)
create or replace function public.check_member_family()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from members where id = new.member_id and family_id = new.family_id) then
    raise exception 'member does not belong to family';
  end if;
  return new;
end $$;
create trigger measurements_mf before insert or update on public.measurements for each row execute function public.check_member_family();
create trigger illnesses_mf    before insert or update on public.illnesses    for each row execute function public.check_member_family();
create trigger vaccinations_mf before insert or update on public.vaccinations for each row execute function public.check_member_family();
create trigger documents_mf    before insert or update on public.documents    for each row execute function public.check_member_family();

-- =====================================================================
-- Storage: bucket riêng tư "documents", đường dẫn: {family_id}/{member_id}/{file}
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 10485760)
on conflict (id) do nothing;

create policy docs_read on storage.objects for select
  using (bucket_id = 'documents' and public.is_family_member(((storage.foldername(name))[1])::uuid));
create policy docs_insert on storage.objects for insert
  with check (bucket_id = 'documents' and public.can_edit_family(((storage.foldername(name))[1])::uuid));
create policy docs_delete on storage.objects for delete
  using (bucket_id = 'documents' and public.can_edit_family(((storage.foldername(name))[1])::uuid));
