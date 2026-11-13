-- =====================================================================
-- 0010: Nhiều người liên hệ khẩn cấp cho mỗi thành viên
--   emergency_contacts = [{"name": "Mẹ – Lan", "phone": "0912345678"}, ...]
-- Chạy trong Supabase > SQL Editor (cần đã chạy 0005)
-- =====================================================================
alter table public.members add column if not exists emergency_contacts jsonb not null default '[]'::jsonb;

-- Chuyển người liên hệ cũ (1 người) sang danh sách
update public.members
set emergency_contacts = jsonb_build_array(jsonb_build_object('name', coalesce(emergency_contact, ''), 'phone', coalesce(emergency_phone, '')))
where emergency_contacts = '[]'::jsonb and (coalesce(emergency_contact, '') <> '' or coalesce(emergency_phone, '') <> '');

-- Thẻ khẩn cấp công khai: trả thêm danh sách liên hệ
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
    'emergency_contacts', m.emergency_contacts,
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
