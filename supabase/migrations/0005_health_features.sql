-- =====================================================================
-- 0005: Thẻ khẩn cấp, thuốc, nhật ký sốt, mốc phát triển, khám định kỳ,
--       chỉ số người lớn (huyết áp, đường huyết, mỡ máu), thai kỳ, thông báo email
-- Chạy trong Supabase > SQL Editor (chạy lại nhiều lần không lỗi)
-- =====================================================================

-- ---------- Thông tin khẩn cấp trên hồ sơ thành viên
alter table public.members add column if not exists emergency_contact text;   -- tên người liên hệ
alter table public.members add column if not exists emergency_phone   text;
alter table public.members add column if not exists insurance_number  text;   -- số thẻ BHYT
alter table public.members add column if not exists emergency_token   uuid unique; -- link/QR công khai (null = tắt)

-- ---------- Thuốc đang dùng + giờ nhắc
create table if not exists public.medications (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  illness_id  uuid references public.illnesses(id) on delete set null,
  name        text not null,                 -- VD: Amoxicillin 250mg
  dosage      text,                          -- VD: 1 gói, 5ml
  times       text[] not null default '{}',  -- giờ uống, VD {08:00,20:00} (giờ Việt Nam)
  start_on    date not null default current_date,
  end_on      date,                          -- null = dùng lâu dài
  remind      boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists medications_member_idx on public.medications(member_id, start_on);

-- ---------- Nhật ký nhiệt độ (sốt)
create table if not exists public.temperatures (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  illness_id  uuid references public.illnesses(id) on delete set null,
  measured_at timestamptz not null default now(),
  temp_c      numeric(4,1) not null check (temp_c between 30 and 45),
  site        text,                          -- nách, tai, trán, miệng, hậu môn
  medicine    text,                          -- thuốc hạ sốt đã dùng
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists temperatures_member_idx on public.temperatures(member_id, measured_at);

-- ---------- Mốc phát triển trẻ em
create table if not exists public.milestones (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  code        text not null,
  achieved_on date not null,
  notes       text,
  created_at  timestamptz not null default now(),
  unique (member_id, code)
);

-- ---------- Thai kỳ
create table if not exists public.pregnancies (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  lmp           date not null,               -- ngày đầu kỳ kinh cuối
  due_date      date not null,               -- ngày dự sinh
  pre_weight_kg numeric(5,2),                -- cân nặng trước mang thai
  ended_on      date,                        -- ngày sinh / kết thúc
  outcome       text,
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists pregnancies_member_idx on public.pregnancies(member_id, lmp);

-- ---------- Khám định kỳ: răng, mắt, tổng quát, khám thai
create table if not exists public.checkups (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families(id) on delete cascade,
  member_id    uuid not null references public.members(id) on delete cascade,
  kind         text not null check (kind in ('dental','eye','general','prenatal')),
  done_on      date not null,
  pregnancy_id uuid references public.pregnancies(id) on delete cascade,
  visit_code   text,                         -- mốc khám thai (VD: nt, morph)
  facility     text,
  result       text,
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists checkups_member_idx on public.checkups(member_id, kind, done_on);

-- ---------- Chỉ số người lớn
create table if not exists public.vitals (
  id               uuid primary key default gen_random_uuid(),
  family_id        uuid not null references public.families(id) on delete cascade,
  member_id        uuid not null references public.members(id) on delete cascade,
  measured_at      timestamptz not null default now(),
  systolic         int  check (systolic between 50 and 300),
  diastolic        int  check (diastolic between 30 and 200),
  pulse            int  check (pulse between 20 and 250),
  glucose          numeric(4,1),             -- mmol/L
  glucose_context  text check (glucose_context in ('fasting','after_meal','random')),
  cholesterol      numeric(4,2),             -- mmol/L
  ldl              numeric(4,2),
  hdl              numeric(4,2),
  triglycerides    numeric(5,2),
  notes            text,
  created_at       timestamptz not null default now()
);
create index if not exists vitals_member_idx on public.vitals(member_id, measured_at);

-- ---------- RLS + kiểm tra thành viên thuộc gia đình (giống các bảng khác)
do $$
declare t text;
begin
  foreach t in array array['medications','temperatures','milestones','pregnancies','checkups','vitals'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for select using (public.is_family_member(family_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert with check (public.can_edit_family(family_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update using (public.can_edit_family(family_id)) with check (public.can_edit_family(family_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete using (public.can_edit_family(family_id))', t || '_delete', t);
    execute format('drop trigger if exists %I on public.%I', t || '_mf', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.check_member_family()', t || '_mf', t);
  end loop;
end $$;

-- ---------- Cài đặt thông báo mới
alter table public.notification_settings add column if not exists notify_medication boolean not null default true;
alter table public.notification_settings add column if not exists notify_email      boolean not null default false;

-- ---------- Thẻ khẩn cấp công khai (mở bằng QR, không cần đăng nhập)
-- Chỉ trả về thông tin cấp cứu tối thiểu, khi chủ hồ sơ đã bật link.
create or replace function public.emergency_card(t uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'full_name', m.full_name,
    'gender', m.gender,
    'birth_date', m.birth_date,
    'blood_type', m.blood_type,
    'allergies', m.allergies,
    'chronic_conditions', m.chronic_conditions,
    'emergency_contact', m.emergency_contact,
    'emergency_phone', m.emergency_phone,
    'insurance_number', m.insurance_number,
    'medications', coalesce((
      select json_agg(json_build_object('name', d.name, 'dosage', d.dosage) order by d.name)
      from medications d
      where d.member_id = m.id and d.start_on <= current_date and (d.end_on is null or d.end_on >= current_date)
    ), '[]'::json)
  )
  from members m
  where t is not null and m.emergency_token = t;
$$;
revoke all on function public.emergency_card(uuid) from public;
grant execute on function public.emergency_card(uuid) to anon, authenticated;
