"use client";
/**
 * Lớp truy cập dữ liệu. Mọi truy vấn qua Supabase + RLS.
 * Khi thương mại hóa có thể thay bằng API riêng mà không đổi UI.
 */
import { supabase } from "./supabase/client";
import {
  normalizeMeasurement,
  type DocumentFile,
  type Illness,
  type Measurement,
  type Member,
  type RefType,
  type Vaccination,
} from "./types";
import { compressImage } from "./image";
import { isEmail, toE164 } from "./phone";

type Table = "members" | "measurements" | "illnesses" | "vaccinations" | "documents";

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Bỏ trường rỗng "" -> null để lưu DB sạch */
function clean<T extends object>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v === "" ? null : v;
  return out as T;
}

async function upsert<T extends { id?: string }>(table: Table, row: Partial<T>): Promise<T> {
  const data = clean(row) as Record<string, unknown>;
  const { id, ...rest } = data;
  const q = id
    ? supabase().from(table).update(rest).eq("id", id as string).select().single()
    : supabase().from(table).insert(rest).select().single();
  return check(await q) as T;
}

async function remove(table: Table, id: string) {
  check(await supabase().from(table).delete().eq("id", id));
}

// ---------- Members
export async function listMembers(familyId: string): Promise<Member[]> {
  return check(await supabase().from("members").select("*").eq("family_id", familyId).order("birth_date"));
}
export async function getMember(id: string): Promise<Member | null> {
  return check(await supabase().from("members").select("*").eq("id", id).maybeSingle());
}
export const saveMember = (m: Partial<Member>) => upsert<Member>("members", m);
export const deleteMember = (id: string) => remove("members", id);

// ---------- Measurements
export async function listMeasurements(by: { memberId?: string; familyId?: string }): Promise<Measurement[]> {
  let q = supabase().from("measurements").select("*").order("measured_on");
  if (by.memberId) q = q.eq("member_id", by.memberId);
  if (by.familyId) q = q.eq("family_id", by.familyId);
  return (check(await q) as Record<string, unknown>[]).map(normalizeMeasurement);
}
export const saveMeasurement = async (m: Partial<Measurement>) =>
  normalizeMeasurement((await upsert<Measurement>("measurements", m)) as unknown as Record<string, unknown>);
export const deleteMeasurement = (id: string) => remove("measurements", id);

// ---------- Illnesses
export async function listIllnesses(by: { memberId?: string; familyId?: string }): Promise<Illness[]> {
  let q = supabase().from("illnesses").select("*").order("started_on", { ascending: false });
  if (by.memberId) q = q.eq("member_id", by.memberId);
  if (by.familyId) q = q.eq("family_id", by.familyId);
  return check(await q);
}
export const saveIllness = (m: Partial<Illness>) => upsert<Illness>("illnesses", m);
export const deleteIllness = (id: string) => remove("illnesses", id);

// ---------- Vaccinations
export async function listVaccinations(by: { memberId?: string; familyId?: string }): Promise<Vaccination[]> {
  let q = supabase().from("vaccinations").select("*").order("administered_on");
  if (by.memberId) q = q.eq("member_id", by.memberId);
  if (by.familyId) q = q.eq("family_id", by.familyId);
  return check(await q);
}
export const saveVaccination = (m: Partial<Vaccination>) => upsert<Vaccination>("vaccinations", m);
export const deleteVaccination = (id: string) => remove("vaccinations", id);

// ---------- Documents (ảnh giấy tờ)
const BUCKET = "documents";

/** refId: undefined = mọi tài liệu của loại; null = chỉ tài liệu không gắn bản ghi (VD: ảnh sổ tiêm) */
export async function listDocuments(memberId: string, refType?: RefType, refId?: string | null): Promise<DocumentFile[]> {
  let q = supabase().from("documents").select("*").eq("member_id", memberId).order("created_at", { ascending: false });
  if (refType) q = q.eq("ref_type", refType);
  if (refId) q = q.eq("ref_id", refId);
  else if (refId === null) q = q.is("ref_id", null);
  return check(await q);
}

export async function uploadDocument(
  member: Pick<Member, "id" | "family_id">,
  original: File,
  refType: RefType = "general",
  refId?: string | null,
): Promise<DocumentFile> {
  const file = await compressImage(original);
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `${member.family_id}/${member.id}/${crypto.randomUUID()}.${ext}`;
  const up = await supabase().storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) throw new Error(up.error.message);
  return check(
    await supabase()
      .from("documents")
      .insert({
        family_id: member.family_id,
        member_id: member.id,
        ref_type: refType,
        ref_id: refId ?? null,
        storage_path: path,
        file_name: original.name,
        mime_type: file.type,
        size_bytes: file.size,
      })
      .select()
      .single(),
  );
}

export async function signedUrl(path: string, seconds = 3600): Promise<string | null> {
  const { data } = await supabase().storage.from(BUCKET).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

export async function deleteDocument(doc: DocumentFile) {
  await supabase().storage.from(BUCKET).remove([doc.storage_path]);
  await remove("documents", doc.id);
}

// ---------- Gia đình & chia sẻ
export async function renameFamily(id: string, name: string) {
  check(await supabase().from("families").update({ name }).eq("id", id));
}
export async function familyUsers(fid: string): Promise<{ user_id: string; email: string; role: string }[]> {
  return check(await supabase().rpc("family_user_list", { fid }));
}
export async function listInvites(fid: string): Promise<{ id: string; email: string | null; phone: string | null; role: string }[]> {
  return check(await supabase().from("family_invites").select("id,email,phone,role").eq("family_id", fid));
}
/** contact: email hoặc số điện thoại */
export async function inviteUser(fid: string, contact: string, role: "editor" | "viewer") {
  const { data: u } = await supabase().auth.getUser();
  const c = contact.trim();
  let email: string | null = null;
  let phone: string | null = null;
  if (isEmail(c)) email = c.toLowerCase();
  else {
    const p = toE164(c);
    if (!p) throw new Error("Nhập email hoặc số điện thoại hợp lệ.");
    phone = p.slice(1); // lưu dạng 84912345678 (giống auth.users.phone)
  }
  check(await supabase().from("family_invites").insert({ family_id: fid, email, phone, role, invited_by: u.user?.id }));
}
export async function cancelInvite(id: string) {
  check(await supabase().from("family_invites").delete().eq("id", id));
}
export async function removeFamilyUser(fid: string, userId: string) {
  check(await supabase().from("family_users").delete().eq("family_id", fid).eq("user_id", userId));
}

/** Xuất toàn bộ dữ liệu gia đình ra JSON (sao lưu) */
export async function exportFamily(fid: string) {
  const [members, measurements, illnesses, vaccinations, documents] = await Promise.all([
    listMembers(fid),
    listMeasurements({ familyId: fid }),
    listIllnesses({ familyId: fid }),
    listVaccinations({ familyId: fid }),
    check(await supabase().from("documents").select("*").eq("family_id", fid)),
  ]);
  return { exported_at: new Date().toISOString(), members, measurements, illnesses, vaccinations, documents };
}
